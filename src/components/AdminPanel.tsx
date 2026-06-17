/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Event, Team, Clue, GameplayState } from '../types';
import { 
  getEvents, saveEvents, 
  getTeams, saveTeams, 
  getClues, saveClues, 
  getGameplayStates, resetAllData, deleteGameplay, saveGameplay,
  getTeamClueSequence
} from '../utils/storage';
import { 
  Plus, Trash2, MapPin, Users, Award, 
  RotateCcw, Sparkles, CheckCircle2, ChevronRight, 
  Eye, Calendar, HelpCircle, Image as ImageIcon, Check, X,
  Lock, Unlock, EyeOff, KeyRound, Edit, Download, Video,
  Trophy, Clock, Timer
} from 'lucide-react';

interface AdminPanelProps {
  onRefreshTrigger: () => void;
  refreshTrigger: number;
}

/** Detects if a media string is a video (data URI or URL with video extension) */
function isVideoMedia(media: string): boolean {
  if (!media) return false;
  if (media.startsWith('data:video/')) return true;
  // Check URL file extension for video formats
  try {
    const url = new URL(media);
    const path = url.pathname.toLowerCase();
    return /\.(mp4|webm|ogg|mov|avi|mkv)$/i.test(path);
  } catch {
    return false;
  }
}

/** Downloads a media file (image or video) from a URL or base64 data URI */
function downloadMedia(media: string, filename: string) {
  try {
    if (media.startsWith('data:')) {
      // Data URI: create download link directly
      const link = document.createElement('a');
      link.href = media;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      // URL: fetch as blob then download
      fetch(media, { mode: 'cors' })
        .then(res => res.blob())
        .then(blob => {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        })
        .catch(() => {
          // Fallback: open in new tab if CORS blocks download
          window.open(media, '_blank');
        });
    }
  } catch {
    window.open(media, '_blank');
  }
}

export default function AdminPanel({ onRefreshTrigger, refreshTrigger }: AdminPanelProps) {
  // Authentication states
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return sessionStorage.getItem('isLaterallisAdmin') === 'true';
  });
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPassword = passwordInput.trim().toLowerCase();
    
    // Allow administrative passcodes
    if (cleanPassword === 'admin' || cleanPassword === 'admin123' || cleanPassword === 'laterallis2026') {
      sessionStorage.setItem('isLaterallisAdmin', 'true');
      setIsAuthenticated(true);
      setAuthError('');
      setPasswordInput('');
    } else {
      setAuthError('Senha incorreta! Tente novamente.');
    }
  };

  const handleLogout = () => {
    if (confirm('Deseja realmente sair da área administrativa?')) {
      sessionStorage.removeItem('isLaterallisAdmin');
      setIsAuthenticated(false);
    }
  };

  // Database States
  const [events, setEvents] = useState<Event[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [clues, setClues] = useState<Clue[]>([]);
  const [gameplayStates, setGameplayStates] = useState<GameplayState[]>([]);

  // Active Admin States
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  
  // Forms States - Event
  const [newEventName, setNewEventName] = useState('');
  const [newEventDate, setNewEventDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Forms States - Team
  const [newTeamName, setNewTeamName] = useState('');

  // Forms States - Clue
  const [clueSequence, setClueSequence] = useState<number>(1);
  const [clueMovement, setClueMovement] = useState('');
  const [clueQrCode, setClueQrCode] = useState('');
  const [clueMotor, setClueMotor] = useState('');
  const [editingClueId, setEditingClueId] = useState<string | null>(null);

  // Photo viewer modal state
  const [viewingPhoto, setViewingPhoto] = useState<{
    teamName: string;
    clueSeq: number;
    photo: string;
    teamId?: string;
    isPending?: boolean;
  } | null>(null);

  // Load and refresh state
  useEffect(() => {
    const loadedEvents = getEvents();
    const loadedTeams = getTeams();
    const loadedClues = getClues();
    const loadedGameplay = getGameplayStates();

    setEvents(loadedEvents);
    setTeams(loadedTeams);
    setClues(loadedClues);
    setGameplayStates(loadedGameplay);

    // Default to the first event if none selected
    if (loadedEvents.length > 0 && !selectedEventId) {
      setSelectedEventId(loadedEvents[0].id);
    }
  }, [refreshTrigger, selectedEventId]);

  // Handle Event select
  const currentEvent = events.find(e => e.id === selectedEventId);
  const currentTeams = teams.filter(t => t.eventId === selectedEventId);
  const currentClues = clues
    .filter(c => c.eventId === selectedEventId)
    .sort((a, b) => a.sequence - b.sequence);

  // Auto-calculate next clue sequence when currentClues changes
  useEffect(() => {
    if (editingClueId) return; // Keep edited sequence intact
    if (currentClues.length > 0) {
      const maxSeq = Math.max(...currentClues.map(c => c.sequence));
      setClueSequence(maxSeq + 1);
    } else {
      setClueSequence(1);
    }
  }, [selectedEventId, clues, editingClueId]);

  // Actions: CREATE EVENT
  const handleCreateEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventName.trim()) return;

    const newEvent: Event = {
      id: `evt-${Date.now()}`,
      name: newEventName.trim(),
      date: newEventDate,
    };

    const updated = [...events, newEvent];
    setEvents(updated);
    saveEvents(updated);
    setSelectedEventId(newEvent.id);
    setNewEventName('');
    onRefreshTrigger();
  };

  // Actions: DELETE EVENT
  const handleDeleteEvent = (id: string) => {
    if (confirm('Tem certeza de que deseja excluir este evento? Todos as equipes e pistas associadas serão afetadas.')) {
      const updatedEvents = events.filter(e => e.id !== id);
      setEvents(updatedEvents);
      saveEvents(updatedEvents);

      // Clean up teams and clues
      const updatedTeams = teams.filter(t => t.eventId !== id);
      saveTeams(updatedTeams);
      setTeams(updatedTeams);

      const updatedClues = clues.filter(c => c.eventId !== id);
      saveClues(updatedClues);
      setClues(updatedClues);

      // Reset selection
      if (selectedEventId === id) {
        setSelectedEventId(updatedEvents.length > 0 ? updatedEvents[0].id : '');
      }
      onRefreshTrigger();
    }
  };

  // Actions: CREATE TEAM
  const handleCreateTeam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEventId) {
      alert('Selecione ou crie um evento primeiro!');
      return;
    }
    if (!newTeamName.trim()) return;

    const updatedTeams = [...teams, {
      id: `team-${Date.now()}`,
      eventId: selectedEventId,
      name: newTeamName.trim(),
    }];

    setTeams(updatedTeams);
    saveTeams(updatedTeams);
    setNewTeamName('');
    onRefreshTrigger();
  };

  // Actions: DELETE TEAM
  const handleDeleteTeam = (id: string, name: string) => {
    if (confirm(`Excluir a equipe "${name}"?`)) {
      const updated = teams.filter(t => t.id !== id);
      setTeams(updated);
      saveTeams(updated);
      deleteGameplay(selectedEventId, id);
      onRefreshTrigger();
    }
  };

  // Actions: CLUE EDIT LIFECYCLE
  const handleStartEditClue = (cl: Clue) => {
    setEditingClueId(cl.id);
    setClueSequence(cl.sequence);
    setClueQrCode(cl.qrCode);
    setClueMovement(cl.movementCommand);
    setClueMotor(cl.motorChallenge);
    
    // Scroll window smoothly to the form
    const formElement = document.getElementById('panel-admin-clues');
    if (formElement) {
      formElement.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleCancelEditClue = () => {
    setEditingClueId(null);
    setClueMovement('');
    setClueQrCode('');
    setClueMotor('');
    if (currentClues.length > 0) {
      const maxSeq = Math.max(...currentClues.map(c => c.sequence));
      setClueSequence(maxSeq + 1);
    } else {
      setClueSequence(1);
    }
  };

  // Actions: APPROVE/VALIDATE SUBMITTED TASK PROOF
  const handleApproveProof = (teamId: string) => {
    const playState = gameplayStates.find(s => s.teamId === teamId && s.eventId === selectedEventId);
    if (!playState) return;

    const teamClues = clues
      .filter(c => c.eventId === selectedEventId)
      .sort((a, b) => a.sequence - b.sequence);
    
    const teamSequence = getTeamClueSequence(teamClues, teamId);
    const nextIndex = playState.currentClueIndex + 1;
    const isCompleted = nextIndex >= teamSequence.length;

    const updatedState: GameplayState = {
      ...playState,
      currentClueIndex: isCompleted ? playState.currentClueIndex : nextIndex,
      isCompleted: isCompleted,
      pendingValidation: false,
      completedAt: isCompleted ? new Date().toISOString() : undefined
    };

    saveGameplay(updatedState);
    
    // Refresh lists
    onRefreshTrigger();
  };

  // Actions: REJECT/INVALIDATE SUBMITTED TASK PROOF
  const handleRejectProof = (teamId: string) => {
    const playState = gameplayStates.find(s => s.teamId === teamId && s.eventId === selectedEventId);
    if (!playState) return;

    const teamClues = clues
      .filter(c => c.eventId === selectedEventId)
      .sort((a, b) => a.sequence - b.sequence);
    
    const teamSequence = getTeamClueSequence(teamClues, teamId);
    const currentClue = teamSequence[playState.currentClueIndex];
    
    // Clear the uploaded photo for the rejected clue so player can upload again
    const updatedPhotos = { ...playState.photos };
    if (currentClue) {
      delete updatedPhotos[currentClue.id];
    }

    const updatedState: GameplayState = {
      ...playState,
      photos: updatedPhotos,
      pendingValidation: false
    };

    saveGameplay(updatedState);
    
    // Refresh lists
    onRefreshTrigger();
  };

  // Actions: CREATE OR EDIT CLUE
  const handleCreateClue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEventId) return;
    if (!clueMovement.trim() || !clueQrCode.trim() || !clueMotor.trim()) {
      alert('Por favor, preencha todos os campos do desafio.');
      return;
    }

    if (editingClueId) {
      // Edit existing clue
      const updated = clues.map(c => {
        if (c.id === editingClueId) {
          return {
            ...c,
            sequence: clueSequence,
            movementCommand: clueMovement.trim(),
            qrCode: clueQrCode.trim().toUpperCase(),
            motorChallenge: clueMotor.trim(),
          };
        }
        return c;
      });

      setClues(updated);
      saveClues(updated);
      setEditingClueId(null);
      setClueMovement('');
      setClueQrCode('');
      setClueMotor('');
      onRefreshTrigger();
    } else {
      // Create new clue
      const seqExists = currentClues.some(c => c.sequence === clueSequence);
      if (seqExists) {
        if (!confirm(`A sequência ${clueSequence} já existe. Deseja criar duplicado ou ajustar a ordem manualmente na lista?`)) {
          return;
        }
      }

      const newClue: Clue = {
        id: `clue-${Date.now()}`,
        eventId: selectedEventId,
        sequence: clueSequence,
        movementCommand: clueMovement.trim(),
        qrCode: clueQrCode.trim().toUpperCase(),
        motorChallenge: clueMotor.trim(),
      };

      const updated = [...clues, newClue];
      setClues(updated);
      saveClues(updated);

      setClueMovement('');
      setClueQrCode('');
      setClueMotor('');
      onRefreshTrigger();
    }
  };

  // Actions: DELETE CLUE
  const handleDeleteClue = (id: string) => {
    // If we're deleting the clue we're currently editing, cancel edit mode
    if (id === editingClueId) {
      handleCancelEditClue();
    }
    const updated = clues.filter(c => c.id !== id);
    setClues(updated);
    saveClues(updated);
    onRefreshTrigger();
  };

  // Actions: RESET SYSTEMS TO SEED MOCK DATA
  const handleResetToSeeds = () => {
    if (confirm('Atenção: Isso redefinirá todo o banco de dados local para os dados de exemplo predefinidos (apagando mudanças que você fez). Deseja continuar?')) {
      resetAllData();
      onRefreshTrigger();
      // Select the first item
      const loaded = getEvents();
      if (loaded.length > 0) {
        setSelectedEventId(loaded[0].id);
      }
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto my-12 animate-fade-in" id="admin-login-wrapper">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden animate-fade-in" id="admin-login-card">
          
          {/* Top visual brand banner */}
          <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 p-8 text-center text-white relative">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-indigo-500/30 via-transparent to-transparent"></div>
            <div className="mx-auto w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center border border-white/25 shadow-inner mb-4">
              <Lock className="w-6 h-6 text-white text-indigo-200" />
            </div>
            <h2 className="text-2xl font-black font-sans tracking-tight">Painel Administrativo</h2>
            <p className="text-indigo-100/90 text-xs mt-1">Acesso seguro para organizadores do Laterallis</p>
          </div>

          {/* Form container */}
          <form onSubmit={handleLoginSubmit} className="p-8 space-y-6">
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase" htmlFor="admin-password">
                Senha do Organizador
              </label>
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="admin-password"
                  value={passwordInput}
                  onChange={(e) => {
                    setPasswordInput(e.target.value);
                    if (authError) setAuthError('');
                  }}
                  placeholder="Digite a senha administrativa"
                  className="block w-full pl-10 pr-10 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                  title={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {authError && (
              <div className="p-3 bg-rose-50 border border-rose-150 rounded-xl text-rose-600 text-xs font-semibold flex items-center gap-2" id="admin-login-error">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"></span>
                <p>{authError}</p>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-indigo-500/10 hover:shadow-indigo-500/20 active:shadow-none flex items-center justify-center gap-2 cursor-pointer"
              id="admin-login-submit"
            >
              <Unlock className="w-4 h-4" />
              Destravar Painel
            </button>

            {/* Secured lock information footer */}
            <div className="pt-4 border-t border-slate-100 text-center">
              <span className="text-[10px] text-slate-400 font-sans tracking-wide">
                Ambiente criptografado e sincronizado em tempo real.
              </span>
            </div>
          </form>

        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12 animate-fade-in" id="panel-admin-root">
      {/* SEED DATA & SYSTEM STATUS ROW */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200/90 shadow-sm">
        <div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-150">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse"></span>
            Interface Administrativa Ativa
          </span>
          <p className="text-slate-500 text-xs mt-1 font-sans">
            Configure eventos, cadastre equipes, instale pistas coordenadas e audite o progresso.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button 
            onClick={handleResetToSeeds}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 active:bg-slate-150 text-slate-700 transition-all rounded-lg border border-slate-200 text-xs font-semibold cursor-pointer h-9"
            title="Restaura os dados originais no LocalStorage para testes ágeis."
            id="btn-restore-seeds"
          >
            <RotateCcw className="w-3.5 h-3.5 text-indigo-600" />
            Restaurar Dados
          </button>
          <button 
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 active:bg-rose-150 text-rose-700 transition-all rounded-lg border border-rose-200 text-xs font-bold cursor-pointer h-9 hover:border-rose-300"
            title="Bloquear painel administrativo"
            id="btn-admin-logout"
          >
            <Lock className="w-3.5 h-3.5" />
            Sair do Painel
          </button>
        </div>
      </div>

      {/* CORE CONTROL CARDS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT COLUMN: EVENTS SETUP (GRID WIDTH: 4/12) */}
        <div className="lg:col-span-4 space-y-6" id="section-admin-events">
          <div className="bg-white border border-slate-200/90 p-6 rounded-2xl shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg border border-indigo-100">
                <Calendar className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-slate-800 font-sans tracking-tight">1. Gestão de Eventos</h2>
            </div>

            {/* EVENT CREATION FORM */}
            <form onSubmit={handleCreateEvent} className="space-y-3 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200/80 shadow-sm" id="form-create-event">
              <div>
                <label className="block text-slate-650 text-xs font-semibold mb-1.5">Nome do Evento</label>
                <input
                  type="text"
                  placeholder="Ex: Treinamento Lateralidade 2026"
                  value={newEventName}
                  onChange={e => setNewEventName(e.target.value)}
                  className="w-full bg-white border border-slate-250 text-slate-800 text-sm rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                  id="input-event-name"
                />
              </div>
              <div>
                <label className="block text-slate-650 text-xs font-semibold mb-1.5">Data do Evento</label>
                <input
                  type="date"
                  value={newEventDate}
                  onChange={e => setNewEventDate(e.target.value)}
                  className="w-full bg-white border border-slate-250 text-slate-800 text-sm rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                  id="input-event-date"
                />
              </div>
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 font-bold px-4 py-2 rounded-lg text-white text-xs transition-colors cursor-pointer"
                id="btn-save-event"
              >
                <Plus className="w-4 h-4" />
                Criar Evento Novo
              </button>
            </form>

            {/* LIST OF EVENTS */}
            <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1" id="list-events-container">
              <label className="block text-slate-500 text-xs font-semibold mb-2">Selecione ou Exclua Eventos</label>
              {events.length === 0 ? (
                <div className="text-center py-6 border border-dashed border-slate-200 rounded-lg text-slate-400 bg-slate-50 text-xs font-sans">
                  Nenhum evento registrado. Crie um acima!
                </div>
              ) : (
                events.map(evt => {
                  const isActive = evt.id === selectedEventId;
                  const teamCount = teams.filter(t => t.eventId === evt.id).length;
                  const clueCount = clues.filter(c => c.eventId === evt.id).length;

                  return (
                    <div 
                      key={evt.id}
                      onClick={() => setSelectedEventId(evt.id)}
                      className={`group flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                        isActive 
                          ? 'bg-indigo-50/70 border-indigo-300 text-slate-900 shadow-sm' 
                          : 'bg-white hover:bg-slate-50/80 border-slate-200 text-slate-700'
                      }`}
                      id={`event-item-${evt.id}`}
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="flex items-center gap-2">
                          <p className={`font-bold text-xs truncate font-sans ${isActive ? 'text-indigo-900' : 'text-slate-800'}`}>
                            {evt.name}
                          </p>
                          {isActive && (
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500">
                          <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                            {evt.date}
                          </span>
                          <span>•</span>
                          <span>{teamCount} eq de {clueCount} pist</span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteEvent(evt.id);
                        }}
                        className="opacity-40 hover:opacity-100 hover:text-rose-600 p-1.5 rounded transition-all transition-opacity text-slate-400 cursor-pointer"
                        title="Excluir este evento permanentemente"
                        id={`btn-delete-event-${evt.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
            {/* MIDDLE COLUMN: EVENT DETAILED MANAGEMENT (GRID WIDTH: 8/12) */}
        <div className="lg:col-span-8 space-y-6" id="section-admin-details">
          
          {/* SECURE GUARD IF NO EVENT SELECTED */}
          {!selectedEventId ? (
            <div className="bg-white border border-slate-200 p-12 rounded-2xl flex flex-col items-center justify-center text-center shadow-sm">
              <MapPin className="w-12 h-12 text-slate-300 mb-3 animate-pulse" />
              <h3 className="text-base font-bold text-slate-700">Nenhum evento ativo</h3>
              <p className="text-slate-400 text-xs max-w-sm mt-1">
                Por favor, cadastre ou selecione um evento na barra lateral esquerda para iniciar a inserção de equipes e desafios de lateralidade.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* HEADER SHOWING CURRENT SELECTED EVENT */}
              <div className="bg-gradient-to-r from-indigo-50 to-indigo-50/20 border border-indigo-100 p-5 rounded-2xl shadow-sm">
                <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded border border-indigo-250 uppercase tracking-wider">
                  Evento em Edição Ativa
                </span>
                <h1 className="text-xl font-extrabold text-slate-800 font-sans tracking-tight mt-1 truncate">
                  {currentEvent?.name}
                </h1>
                <p className="text-slate-500 text-xs font-mono mt-1">
                  ID: {currentEvent?.id} | Data Prevista: {currentEvent?.date}
                </p>
              </div>

              {/* GRID FOR TEAMS AND PROGRESS TRACKING */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* 2A) TEAMS PANEL */}
                <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm" id="panel-admin-teams">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg border border-indigo-100">
                      <Users className="w-4 h-4" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-800">2. Gestão de Equipes ({currentTeams.length})</h3>
                  </div>

                  {/* ADD TEAM FORM */}
                  <form onSubmit={handleCreateTeam} className="flex gap-2 mb-4" id="form-create-team">
                    <input
                      type="text"
                      placeholder="Nova Equipe (Ex: Equipe Delta)"
                      value={newTeamName}
                      onChange={e => setNewTeamName(e.target.value)}
                      className="flex-1 bg-slate-50 border border-slate-250 text-slate-800 text-xs rounded-lg px-3 py-2 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                      id="input-team-name"
                    />
                    <button
                      type="submit"
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-2 rounded-lg text-xs transition-colors inline-flex items-center gap-1 cursor-pointer"
                      id="btn-add-team"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Inserir
                    </button>
                  </form>

                  {/* TEAMS LIST */}
                  <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1" id="list-teams-container">
                    {currentTeams.length === 0 ? (
                      <div className="text-center py-4 border border-slate-150 rounded-lg text-slate-450 bg-slate-50/50 text-xs">
                        Nenhuma equipe cadastrada para este evento.
                      </div>
                    ) : (
                      currentTeams.map(tm => (
                        <div 
                          key={tm.id}
                          className="flex items-center justify-between p-2.5 bg-slate-50 hover:bg-slate-100/85 border border-slate-200 rounded-lg text-xs"
                          id={`team-item-${tm.id}`}
                        >
                          <span className="font-semibold text-slate-700 font-sans">{tm.name}</span>
                          <button
                            onClick={() => handleDeleteTeam(tm.id, tm.name)}
                            className="text-slate-400 hover:text-rose-600 transition-colors p-1 rounded cursor-pointer"
                            title="Excluir equipe"
                            id={`btn-delete-team-${tm.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* 2B) REAL-TIME PLAYERS PROGRESS MONITOR */}
                <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm" id="panel-admin-monitor">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 bg-amber-50 text-amber-700 rounded-lg border border-amber-200">
                      <Award className="w-4 h-4" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-800">Monitor de Desempenho Real</h3>
                  </div>
                  
                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1" id="list-progress-monitor">
                    {currentTeams.length === 0 ? (
                      <div className="text-center py-6 text-slate-400 text-xs bg-slate-50/50 rounded-xl border border-slate-150">
                        Aguardando cadastro de equipes...
                      </div>
                    ) : (
                      currentTeams.map(tm => {
                        const playState = gameplayStates.find(s => s.teamId === tm.id && s.eventId === selectedEventId);
                        const currentIdx = playState ? playState.currentClueIndex : 0;
                        const isCompleted = playState ? playState.isCompleted : false;
                        const totalClues = currentClues.length;
                        const progressPercent = totalClues > 0 
                          ? Math.round(((isCompleted ? totalClues : currentIdx) / totalClues) * 100) 
                          : 0;
                        
                        // Collect photos taken
                        const completedPhotos = playState ? Object.entries(playState.photos) : [];

                        // Calculate the team's custom sequence
                        const teamSequence = getTeamClueSequence(currentClues, tm.id);
                        const sequenceRouteString = teamSequence.map(c => `#${c.sequence}`).join(' → ');

                        const isPending = playState?.pendingValidation;
                        return (
                            <div key={tm.id} className={`p-2.5 rounded-xl border space-y-2 transition-all ${
                              isPending
                                ? 'bg-amber-50/60 border-amber-300 shadow-sm animate-pulse'
                                : 'bg-slate-50 border-slate-200'
                            }`}>
                              <div className="flex items-center justify-between text-[11px]">
                                <div className="flex flex-col truncate max-w-[150px]">
                                  <span className="font-bold text-slate-700 truncate">{tm.name}</span>
                                  <span className="text-[9px] text-slate-400 font-medium truncate" title="Rota de pistas consecutivas deste grupo para evitar cruzamentos">
                                    Rota: {sequenceRouteString || 'Nenhuma'}
                                  </span>
                                </div>
                                <span className={`font-mono font-bold text-[10px] px-1.5 py-0.5 rounded ${
                                  isCompleted 
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-250' 
                                    : isPending
                                      ? 'bg-amber-100 text-amber-800 border border-amber-250 font-bold'
                                      : 'bg-indigo-50 text-indigo-750 border border-indigo-150'
                                }`}>
                                  {isCompleted ? 'CONCLUÍDO' : isPending ? 'PENDENTE DE VALIDAÇÃO' : `Pista: ${currentIdx + 1}/${totalClues}`}
                                </span>
                              </div>
                              
                              {/* PROGRESS BAR */}
                              <div className="w-full bg-slate-200 rounded-full h-1.5">
                                <div 
                                  className={`h-1.5 rounded-full transition-all duration-500 ${
                                    isCompleted ? 'bg-emerald-500' : isPending ? 'bg-amber-500 animate-pulse' : 'bg-gradient-to-r from-indigo-500 to-indigo-600'
                                  }`}
                                  style={{ width: `${progressPercent}%` }}
                                ></div>
                              </div>

                              {/* PENDING APPROVAL CALLOUT */}
                              {isPending && (
                                <div className="mt-2 bg-white/90 p-2 rounded-lg border border-amber-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                  <span className="text-[9px] text-amber-800 font-bold animate-pulse">✓ Prova pendente de aprovação</span>
                                  <div className="flex gap-1 justify-end">
                                    {(() => {
                                      const currentClue = teamSequence[currentIdx];
                                      if (currentClue) {
                                        const media = playState.photos[currentClue.id];
                                        if (media) {
                                          return (
                                            <button
                                              onClick={() => setViewingPhoto({ teamName: tm.name, clueSeq: currentClue.sequence, photo: media, teamId: tm.id, isPending: true })}
                                              className="bg-indigo-55 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 py-0.5 px-1.5 rounded font-bold text-[9px] cursor-pointer inline-flex items-center gap-1 whitespace-nowrap"
                                            >
                                              <Eye className="w-2.5 h-2.5" />
                                              Ver Registro
                                            </button>
                                          );
                                        }
                                      }
                                      return null;
                                    })()}
                                    <button
                                      onClick={() => handleApproveProof(tm.id)}
                                      className="bg-emerald-600 hover:bg-emerald-700 text-white py-0.5 px-1.5 rounded font-bold text-[9px] cursor-pointer inline-flex items-center gap-1 shadow-sm whitespace-nowrap"
                                    >
                                      <Check className="w-2.5 h-2.5" />
                                      Validar
                                    </button>
                                    <button
                                      onClick={() => {
                                        if (confirm(`Deseja recusar o envio da equipe "${tm.name}"?`)) {
                                          handleRejectProof(tm.id);
                                        }
                                      }}
                                      className="bg-rose-600 hover:bg-rose-700 text-white py-0.5 px-1.5 rounded font-bold text-[9px] cursor-pointer inline-flex items-center gap-1 shadow-sm whitespace-nowrap"
                                    >
                                      <X className="w-2.5 h-2.5" />
                                      Recusar
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* PHOTO CHIPS REVIEW */}
                              {completedPhotos.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                  <span className="text-[10px] text-slate-400 self-center">Fotos/Vídeos:</span>
                                  {completedPhotos.map(([clueId, base64Str]) => {
                                    // Find the clue sequence index
                                    const c = clues.find(item => item.id === clueId);
                                    const seq = c ? c.sequence : '?';
                                    return (
                                      <button
                                        key={clueId}
                                        onClick={() => setViewingPhoto({ teamName: tm.name, clueSeq: Number(seq), photo: base64Str })}
                                        className="inline-flex items-center gap-1 py-0.5 px-1.5 bg-indigo-50 border border-indigo-100 hover:border-indigo-250 rounded text-[9px] text-indigo-700 font-bold cursor-pointer"
                                        title="Visualizar captura"
                                      >
                                        <ImageIcon className="w-2.5 h-2.5 text-indigo-500" />
                                        Pista {seq}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                  </div>
                </div>

              </div>

              {/* 2C) RANKING / LEADERBOARD SECTION */}
              <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm" id="panel-admin-ranking">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg border border-amber-100">
                    <Trophy className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800">Ranking das Equipes</h3>
                </div>

                {(() => {
                  // Build ranking data for all teams in this event
                  const rankingData = currentTeams.map(tm => {
                    const playState = gameplayStates.find(s => s.teamId === tm.id && s.eventId === selectedEventId);
                    const isCompleted = playState?.isCompleted || false;
                    const startedAt = playState?.startedAt ? new Date(playState.startedAt).getTime() : 0;
                    const completedAt = playState?.completedAt ? new Date(playState.completedAt).getTime() : 0;
                    const elapsedMs = isCompleted && completedAt && startedAt ? completedAt - startedAt : 0;
                    const isInProgress = !!playState && !isCompleted;
                    const currentProgress = playState ? playState.currentClueIndex : 0;
                    return { team: tm, isCompleted, isInProgress, elapsedMs, startedAt, currentProgress, playState };
                  });

                  // Sort: completed first (by time asc), then in-progress (by progress desc), then not started
                  const sorted = [...rankingData].sort((a, b) => {
                    if (a.isCompleted && !b.isCompleted) return -1;
                    if (!a.isCompleted && b.isCompleted) return 1;
                    if (a.isCompleted && b.isCompleted) return a.elapsedMs - b.elapsedMs;
                    if (a.isInProgress && !b.isInProgress) return -1;
                    if (!a.isInProgress && b.isInProgress) return 1;
                    if (a.isInProgress && b.isInProgress) return b.currentProgress - a.currentProgress;
                    return 0;
                  });

                  const completedTeams = sorted.filter(r => r.isCompleted);

                  // Format elapsed time
                  const formatTime = (ms: number) => {
                    if (ms <= 0) return '--:--:--';
                    const totalSecs = Math.floor(ms / 1000);
                    const hrs = Math.floor(totalSecs / 3600);
                    const mins = Math.floor((totalSecs % 3600) / 60);
                    const secs = totalSecs % 60;
                    if (hrs > 0) return `${hrs}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
                    return `${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
                  };

                  const podiumStyles = [
                    { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-700', badge: 'bg-amber-400 text-white', emoji: '🥇', label: 'Campeão' },
                    { bg: 'bg-slate-50', border: 'border-slate-300', text: 'text-slate-600', badge: 'bg-slate-400 text-white', emoji: '🥈', label: '2º Lugar' },
                    { bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-700', badge: 'bg-orange-400 text-white', emoji: '🥉', label: '3º Lugar' },
                  ];

                  if (sorted.length === 0) {
                    return (
                      <div className="text-center py-6 text-slate-400 text-xs bg-slate-50/50 rounded-xl border border-slate-150">
                        Cadastre equipes para visualizar o ranking.
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-2">
                      {/* PODIUM HIGHLIGHT for completed teams */}
                      {completedTeams.length > 0 && (
                        <div className="mb-3">
                          <div className={`grid gap-2 ${completedTeams.length === 1 ? 'grid-cols-1' : completedTeams.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                            {completedTeams.slice(0, 3).map((entry, idx) => {
                              const style = podiumStyles[idx];
                              return (
                                <div key={entry.team.id} className={`${style.bg} border ${style.border} p-3 rounded-xl text-center space-y-1 ${idx === 0 ? 'ring-2 ring-amber-400/30' : ''}`}>
                                  <span className="text-2xl">{style.emoji}</span>
                                  <p className={`text-xs font-extrabold ${style.text}`}>{entry.team.name}</p>
                                  <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-full ${style.badge}`}>
                                    {style.label}
                                  </span>
                                  <p className="text-[10px] font-mono font-bold text-slate-600 flex items-center justify-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {formatTime(entry.elapsedMs)}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* FULL RANKING TABLE */}
                      <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
                        {sorted.map((entry, idx) => {
                          const position = entry.isCompleted ? completedTeams.indexOf(entry) + 1 : '-';
                          const isTop3 = typeof position === 'number' && position <= 3;
                          return (
                            <div
                              key={entry.team.id}
                              className={`flex items-center justify-between p-2.5 rounded-xl border transition-all text-xs ${
                                isTop3
                                  ? `${podiumStyles[Number(position) - 1].bg} ${podiumStyles[Number(position) - 1].border}`
                                  : entry.isInProgress
                                    ? 'bg-indigo-50/50 border-indigo-200'
                                    : 'bg-slate-50 border-slate-150'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-extrabold ${
                                  isTop3
                                    ? `${podiumStyles[Number(position) - 1].badge}`
                                    : entry.isCompleted
                                      ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                      : entry.isInProgress
                                        ? 'bg-indigo-100 text-indigo-600 border border-indigo-200'
                                        : 'bg-slate-100 text-slate-400 border border-slate-200'
                                }`}>
                                  {isTop3 ? podiumStyles[Number(position) - 1].emoji : position}
                                </span>
                                <div>
                                  <p className="font-bold text-slate-700">{entry.team.name}</p>
                                  <p className="text-[9px] text-slate-400">
                                    {entry.isCompleted
                                      ? `Concluído • ${formatTime(entry.elapsedMs)}`
                                      : entry.isInProgress
                                        ? `Em andamento • Etapa ${entry.currentProgress + 1}/${currentClues.length}`
                                        : 'Aguardando início'
                                    }
                                  </p>
                                </div>
                              </div>
                              <div>
                                {entry.isCompleted ? (
                                  <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 font-bold text-[9px] px-2 py-0.5 rounded border border-emerald-200">
                                    <Check className="w-2.5 h-2.5" />
                                    {formatTime(entry.elapsedMs)}
                                  </span>
                                ) : entry.isInProgress ? (
                                  <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-600 font-bold text-[9px] px-2 py-0.5 rounded border border-indigo-200 animate-pulse">
                                    <Timer className="w-2.5 h-2.5" />
                                    Jogando
                                  </span>
                                ) : (
                                  <span className="text-slate-400 text-[9px] font-medium">—</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* 3) CLUES / TRACKS REGISTRATION SECTION */}
              <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm" id="panel-admin-clues">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg border border-indigo-100">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-bold text-slate-800 font-sans">
                    {editingClueId ? `✏️ Editando Pistas / Provas (Pista #${clueSequence})` : `3. Cadastro de Pistas / Provas (${currentClues.length})`}
                  </h3>
                </div>

                {/* FORM TO ADD A NEW PIECE OF CLUE */}
                <form onSubmit={handleCreateClue} className="grid grid-cols-1 md:grid-cols-12 gap-4 bg-slate-50 p-5 rounded-xl border border-slate-200/85 mb-6" id="form-create-clue">
                  
                  {/* SEQUENCE OR SEQUENCE ORDER */}
                  <div className="md:col-span-3">
                    <label className="block text-slate-650 text-xs font-semibold mb-1.5">Ordem da Pista</label>
                    <input
                      type="number"
                      min={1}
                      value={clueSequence}
                      onChange={e => setClueSequence(Number(e.target.value))}
                      className="w-full bg-white border border-slate-250 text-slate-850 text-sm rounded-lg px-3 py-2 focus:ring-1 focus:ring-indigo-500 focus:outline-none font-mono"
                      placeholder="Sequência"
                      id="input-clue-sequence"
                      required
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Ex: 1, 2, 3... (ordem do percurso)</p>
                  </div>

                  {/* QR CODE TOKEN REGISTER */}
                  <div className="md:col-span-4">
                    <label className="block text-slate-655 text-xs font-semibold mb-1.5">Código QR Unificador</label>
                    <input
                      type="text"
                      placeholder="Ex: QR_SL_202"
                      value={clueQrCode}
                      onChange={e => setClueQrCode(e.target.value)}
                      className="w-full bg-white border border-slate-250 text-slate-850 text-sm rounded-lg px-3 py-2 focus:ring-1 focus:ring-indigo-500 focus:outline-none uppercase font-mono"
                      id="input-clue-qrcode"
                      required
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Validador físico (Ex: impresso na pista)</p>
                  </div>

                  {/* EMPTY CORNER IN GRID FOR BETTER ALIGNMENT */}
                  <div className="md:col-span-5 hidden md:block"></div>

                  {/* LATERAL MOVEMENT COMMAND (TEXT AREA) */}
                  <div className="md:col-span-6">
                    <label className="block text-slate-655 text-xs font-semibold mb-1.5">
                      Comando de Movimento (Lateralidade)
                    </label>
                    <textarea
                      placeholder="Ex: Saia da sala de informática, tome o rumo à FRENTE por 10 passos, execute giro à ESQUERDA de 90 graus e caminhe sob uma linha imaginária."
                      rows={3}
                      value={clueMovement}
                      onChange={e => setClueMovement(e.target.value)}
                      className="w-full bg-white border border-slate-250 text-slate-850 text-sm rounded-lg px-3 py-2 focus:ring-1 focus:ring-indigo-500 focus:outline-none leading-relaxed"
                      id="input-clue-movement"
                      required
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Texto descritivo guiando o jogador usando lateralidades.</p>
                  </div>

                  {/* MOTOR CHALLENGE STATEMENT */}
                  <div className="md:col-span-6">
                    <label className="block text-slate-655 text-xs font-semibold mb-1.5">
                      Instrução do Desafio Motor (Foto/Vídeo)
                    </label>
                    <textarea
                      placeholder="Ex: Tire uma foto coletiva de perfil, todos sobre o pé ESQUERDO de braços abertos imitando vôo."
                      rows={3}
                      value={clueMotor}
                      onChange={e => setClueMotor(e.target.value)}
                      className="w-full bg-white border border-slate-250 text-slate-850 text-sm rounded-lg px-3 py-2 focus:ring-1 focus:ring-indigo-500 focus:outline-none leading-relaxed"
                      id="input-clue-motor"
                      required
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Desafio motor final avaliado por imagem para destravar a fase.</p>
                  </div>

                  {/* SUBMIT BUTTON */}
                  <div className="md:col-span-12 flex justify-end gap-2">
                    {editingClueId && (
                      <button
                        type="button"
                        onClick={handleCancelEditClue}
                        className="bg-slate-200 hover:bg-slate-300 text-slate-705 text-slate-700 font-bold px-4 py-2.5 rounded-lg text-xs transition-colors cursor-pointer"
                      >
                        Cancelar Edição
                      </button>
                    )}
                    <button
                      type="submit"
                      className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-lg text-xs transition-colors shadow-sm cursor-pointer"
                      id="btn-save-clue"
                    >
                      {editingClueId ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                      {editingClueId ? 'Salvar Edição de Pista' : 'Cadastrar Prova / Pista'}
                    </button>
                  </div>
                </form>

                {/* CURRENT LIST OF CLUES */}
                <div className="space-y-3" id="list-clues-container">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                    <span className="text-xs font-bold text-slate-550">Pistas Instaladas por Ordem</span>
                    <span className="text-[10px] text-slate-400 font-mono font-medium">Ordem Sequencial Fixa</span>
                  </div>

                  {currentClues.length === 0 ?
                    <div className="bg-white border border-dashed border-slate-200 text-center py-10 rounded-xl text-slate-450 bg-slate-50/50 text-sm font-sans">
                      Nenhuma pista cadastrada para este evento. Configure a primeira pista usando o formulário acima!
                    </div>
                  :
                    currentClues.map((cl, i) => (
                      <div 
                        key={cl.id} 
                        className="bg-slate-50 p-4 rounded-xl border border-slate-200 hover:ring-1 hover:ring-indigo-150 transition-all flex flex-col md:flex-row md:items-start gap-4"
                        id={`clue-card-item-${cl.id}`}
                      >
                        {/* SEQUENCE SPHERE */}
                        <div className="flex items-center gap-2 md:flex-col md:items-center">
                          <span className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 font-mono font-extrabold text-xs flex items-center justify-center">
                            #{cl.sequence}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 font-semibold">Etapa</span>
                        </div>

                        {/* CONTENT WRAPPER */}
                        <div className="flex-1 space-y-3 min-w-0">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-700">
                            
                            {/* MOVEMENT CARD */}
                            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                              <span className="text-[10px] font-bold text-indigo-700 block mb-1 uppercase tracking-wider font-sans">
                                Comando de Lateralidade
                              </span>
                              <p className="leading-relaxed font-sans text-slate-750 font-medium">
                                {cl.movementCommand}
                              </p>
                            </div>

                            {/* MOTOR CODE */}
                            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                              <span className="text-[10px] font-bold text-indigo-755 text-indigo-700 block mb-1 uppercase tracking-wider font-sans">
                                Desafio Motor & Fotos
                              </span>
                              <p className="leading-relaxed font-sans text-slate-750 font-medium">
                                {cl.motorChallenge}
                              </p>
                            </div>

                          </div>

                          <div className="flex flex-wrap gap-3 items-center justify-between text-[11px] pt-1">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400 font-semibold">Chave do QR Code:</span>
                              <span className="bg-slate-200/80 px-2.5 py-0.5 rounded text-indigo-800 font-mono font-bold border border-slate-250">
                                {cl.qrCode}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => handleStartEditClue(cl)}
                                className={`inline-flex items-center gap-1 py-1 px-2.5 rounded font-bold text-[10px] cursor-pointer border transition-colors ${
                                  editingClueId === cl.id
                                    ? 'bg-amber-100 border-amber-300 text-amber-800'
                                    : 'bg-indigo-50 border-indigo-150 hover:bg-indigo-100 text-indigo-700 font-bold'
                                }`}
                                id={`btn-edit-clue-${cl.id}`}
                              >
                                <Edit className="w-3 h-3" />
                                {editingClueId === cl.id ? 'Editando...' : 'Editar'}
                              </button>
                              <button
                                onClick={() => handleDeleteClue(cl.id)}
                                className="inline-flex items-center gap-1 text-slate-400 hover:text-rose-600 font-bold transition-colors py-1 px-2 rounded cursor-pointer text-[10px]"
                                id={`btn-delete-clue-${cl.id}`}
                              >
                                <Trash2 className="w-3 h-3" />
                                Excluir
                              </button>
                            </div>
                          </div>
                        </div>

                      </div>
                    ))
                  }
                </div>

              </div>

            </div>
          )}

        </div>

      </div>

      {/* LIGHTBOX MODAL FOR IMAGE PREVIEW */}
      {viewingPhoto && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4"
          onClick={() => setViewingPhoto(null)}
          id="modal-photo-lightbox"
        >
          <div 
            className="bg-white border border-slate-200 max-w-lg w-full rounded-2xl overflow-hidden shadow-2xl animate-scale-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2">
                {isVideoMedia(viewingPhoto.photo) ? (
                  <Video className="w-4 h-4 text-indigo-600" />
                ) : (
                  <ImageIcon className="w-4 h-4 text-indigo-600" />
                )}
                <h4 className="text-xs font-bold text-slate-800">
                  {viewingPhoto.teamName} - Desafio Motor #{viewingPhoto.clueSeq}
                </h4>
              </div>
              <button 
                onClick={() => setViewingPhoto(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                id="btn-close-photo-modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-4 bg-slate-50/50 flex items-center justify-center">
              {isVideoMedia(viewingPhoto.photo) ? (
                <video 
                  src={viewingPhoto.photo} 
                  controls 
                  playsInline
                  autoPlay
                  className="max-h-[380px] w-auto max-w-full rounded-xl object-contain shadow-md border border-slate-150"
                />
              ) : (
                <img 
                  src={viewingPhoto.photo} 
                  alt="Desafio Motor Validado" 
                  className="max-h-[380px] w-auto max-w-full rounded-xl object-contain shadow-md border border-slate-150"
                  referrerPolicy="no-referrer"
                />
              )}
            </div>
            
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-col gap-3">
              {/* Download button - always visible */}
              <button
                onClick={() => {
                  const ext = isVideoMedia(viewingPhoto.photo) ? 'mp4' : 'jpg';
                  const filename = `${viewingPhoto.teamName.replace(/\s+/g, '_')}_desafio_${viewingPhoto.clueSeq}.${ext}`;
                  downloadMedia(viewingPhoto.photo, filename);
                }}
                className="w-full bg-slate-700 hover:bg-slate-800 text-white font-bold text-xs px-4 py-2.5 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2"
                id="btn-download-media"
              >
                <Download className="w-3.5 h-3.5" />
                Baixar {isVideoMedia(viewingPhoto.photo) ? 'Vídeo' : 'Imagem'}
              </button>

              {/* Approve/Reject or Close buttons */}
              <div className="flex gap-3">
                {viewingPhoto.isPending && viewingPhoto.teamId ? (
                  <>
                    <button
                      onClick={() => {
                        if (confirm("Deseja recusar este registro de prova? A equipe precisará enviar um novo registro.")) {
                          handleRejectProof(viewingPhoto.teamId!);
                          setViewingPhoto(null);
                        }
                      }}
                      className="bg-rose-600 hover:bg-rose-700 active:bg-rose-650 font-bold text-white text-xs px-4 py-2.5 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 flex-1"
                      id="btn-reject-modal"
                    >
                      <X className="w-3.5 h-3.5" />
                      Recusar
                    </button>
                    <button
                      onClick={() => {
                        handleApproveProof(viewingPhoto.teamId!);
                        setViewingPhoto(null);
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-650 font-bold text-white text-xs px-4 py-2.5 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 flex-1 shadow-md"
                      id="btn-approve-modal"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Aprovar
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setViewingPhoto(null)}
                    className="bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-600 font-bold text-white text-xs px-5 py-2.5 rounded-lg transition-colors cursor-pointer flex-1"
                    id="btn-confirm-close-photo"
                  >
                    Fechar Visualização
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
