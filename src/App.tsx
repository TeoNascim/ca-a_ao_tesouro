/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import AdminPanel from './components/AdminPanel';
import PlayerView from './components/PlayerView';
import { initializeStorage, getEvents } from './utils/storage';
import { supabase } from './utils/supabase';
import { INITIAL_EVENTS, INITIAL_TEAMS, INITIAL_CLUES } from './mockData';
import { Event, Team, Clue, GameplayState } from './types';
import { 
  Compass, HelpCircle, ArrowRight, Shield, 
  Sparkles, CheckCircle2, Heart, Footprints, Cloud, CloudOff
} from 'lucide-react';

export default function App() {
  const [currentView, setCurrentView] = useState<'admin' | 'player'>('player');
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [isCloudActive, setIsCloudActive] = useState<boolean>(false);

  // Initialize storage once at app startup
  useEffect(() => {
    initializeStorage();
  }, []);

  // Increment trigger to force other components to reload from localStorage
  const handleRefreshTrigger = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  // Real-time database synchronization via Supabase Realtime
  useEffect(() => {
    // Fetch all 4 tables from Supabase and sync to localStorage
    const loadAllFromSupabase = async () => {
      try {
        const [eventsRes, teamsRes, cluesRes, gameplayRes] = await Promise.all([
          supabase.from('events').select('*'),
          supabase.from('teams').select('*'),
          supabase.from('clues').select('*'),
          supabase.from('gameplay_states').select('*'),
        ]);

        if (eventsRes.error) throw eventsRes.error;
        if (teamsRes.error) throw teamsRes.error;
        if (cluesRes.error) throw cluesRes.error;
        if (gameplayRes.error) throw gameplayRes.error;

        const events = (eventsRes.data || []) as Event[];
        const teams = (teamsRes.data || []) as Team[];
        const clues = (cluesRes.data || []) as Clue[];
        // Sanitize gameplay data from Supabase:
        // - photos JSONB may be null, ensure it's always an object
        // - Supabase rows include a primary key 'id' field not in our GameplayState type
        const rawGameplay = (gameplayRes.data || []) as any[];
        const gameplay: GameplayState[] = rawGameplay.map(g => ({
          eventId: g.eventId || '',
          teamId: g.teamId || '',
          currentClueIndex: typeof g.currentClueIndex === 'number' ? g.currentClueIndex : 0,
          isCompleted: !!g.isCompleted,
          photos: (g.photos && typeof g.photos === 'object') ? g.photos : {},
          startedAt: g.startedAt || new Date().toISOString(),
          completedAt: g.completedAt || undefined,
          pendingValidation: !!g.pendingValidation,
        }));

        // If Supabase database is fresh & brand new, seed it with the mock data
        if (events.length === 0) {
          await Promise.all([
            supabase.from('events').upsert(INITIAL_EVENTS),
            supabase.from('teams').upsert(INITIAL_TEAMS),
            supabase.from('clues').upsert(INITIAL_CLUES),
          ]);
          setIsCloudActive(true);
          return;
        }

        localStorage.setItem('lateral_hunt_events', JSON.stringify(events));
        localStorage.setItem('lateral_hunt_teams', JSON.stringify(teams));
        localStorage.setItem('lateral_hunt_clues', JSON.stringify(clues));
        localStorage.setItem('lateral_hunt_gameplay', JSON.stringify(gameplay));

        handleRefreshTrigger();
        setIsCloudActive(true);
      } catch (error) {
        console.error('Supabase sync error:', error);
        setIsCloudActive(false);
      }
    };

    // Subscribe to Realtime changes on all 4 tables
    const channel = supabase
      .channel('db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => {
        loadAllFromSupabase();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => {
        loadAllFromSupabase();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clues' }, () => {
        loadAllFromSupabase();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gameplay_states' }, () => {
        loadAllFromSupabase();
      })
      .subscribe();

    // Initial data load on mount
    loadAllFromSupabase();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800 font-sans relative antialiased selection:bg-indigo-500/10 selection:text-indigo-900">
      
      {/* GLOBAL HIGH-CONTRAST LIGHT ACCENT BACKGROUND */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-100/30 via-slate-50 to-slate-50 pointer-events-none z-0"></div>

      {/* HEADER NAVIGATION */}
      <Header currentView={currentView} onViewChange={setCurrentView} />

      {/* MAIN CONTAINER */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 z-10 relative">
        
        {/* APP MOTTO BOX & BRIEF INSTRUCTION */}
        <div className="mb-8 text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-4 bg-white/90 p-4 rounded-2xl border border-slate-200/90 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
              <Footprints className="w-5 h-5" />
            </div>
            <div className="text-left">
              <p className="text-xs font-semibold text-slate-800">Como funciona?</p>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                Cadastre e selecione o evento/equipes no <span className="text-indigo-600 font-semibold">Painel do Administrador</span>.
                Depois, acesse o <span className="text-emerald-600 font-semibold">Modo Jogador</span> simulando o smartphone de cada equipe para vivenciar as pistas em tempo real!
              </p>
            </div>
          </div>
          {isCloudActive ? (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-200 text-[10px] font-bold font-mono">
              <Cloud className="w-3.5 h-3.5 text-emerald-600 animate-pulse shrink-0" />
              <span>NUVEM MULTI-DISPOSITIVO ATIVA</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 rounded-lg border border-amber-200 text-[10px] font-bold font-mono">
              <CloudOff className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>CONECTANDO EM LOGOFF SEGURO</span>
            </div>
          )}
        </div>

        {/* ACTIVE MODULE INJECTION */}
        {currentView === 'admin' ? (
          <AdminPanel 
            onRefreshTrigger={handleRefreshTrigger} 
            refreshTrigger={refreshTrigger} 
          />
        ) : (
          <PlayerView 
            onRefreshTrigger={handleRefreshTrigger} 
            refreshTrigger={refreshTrigger} 
          />
        )}

      </main>

      {/* COMPACT CLEAN FOOTER */}
      <footer className="border-t border-slate-200 bg-white/80 py-6 text-center text-[11px] text-slate-400 font-sans z-10">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© 2026 Laterallis. Todos os direitos reservados.</p>
          <div className="flex items-center gap-4">
            <span className="hover:text-slate-600 transition-colors">LocalStorage Persistente</span>
            <span>•</span>
            <span className="hover:text-slate-300 transition-colors flex items-center gap-1">
              Desenvolvedor Sênior UX/UI
              <Heart className="w-3 h-3 text-red-500 fill-red-500" />
            </span>
          </div>
        </div>
      </footer>

    </div>
  );
}
