/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Event, Team, Clue, GameplayState } from '../types';
import { 
  getEvents, getTeams, getClues, 
  getGameplay, saveGameplay, deleteGameplay,
  getTeamClueSequence, uploadPhoto
} from '../utils/storage';
import { 
  User, CheckCircle, Camera, Check, 
  ArrowRight, Heart, Smartphone, HelpCircle, 
  Key, RefreshCw, Trophy, Sparkles, Navigation, 
  Upload, Sparkle, AlertCircle, ArrowLeft, RotateCcw,
  QrCode, Maximize2, Clock
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

/** Detects if a media string is a video (data URI or URL with video extension) */
function isVideoMedia(media: string): boolean {
  if (!media) return false;
  if (media.startsWith('data:video/')) return true;
  try {
    const url = new URL(media);
    const path = url.pathname.toLowerCase();
    return /\.(mp4|webm|ogg|mov|avi|mkv)$/i.test(path);
  } catch {
    return false;
  }
}

/**
 * Compresses an image source (base64 or object URL) to a maximum dimension
 * and low-JPEG quality for efficient storage.
 */
function compressImage(imgSrc: string, maxDim: number = 600, quality: number = 0.5): Promise<string> {
  return new Promise((resolve) => {
    try {
      if (!imgSrc) {
        resolve(imgSrc);
        return;
      }

      const img = new Image();
      img.onload = () => {
        try {
          let width = img.width;
          let height = img.height;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
          } else {
            resolve(imgSrc);
          }
        } catch {
          resolve(imgSrc);
        }
      };
      img.onerror = () => {
        resolve(imgSrc);
      };
      img.src = imgSrc;
    } catch {
      resolve(imgSrc);
    }
  });
}

/**
 * Extract a thumbnail frame from a video file at 0.5 seconds
 * and compresses it to fit easily in Firestore.
 */
function getVideoFrame(file: File): Promise<string> {
  return new Promise((resolve) => {
    const videoUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'auto';
    video.src = videoUrl;
    video.muted = true;
    video.playsInline = true;
    
    // Seek to 0.5s to capture actual content and avoid blank start screens
    video.currentTime = 0.5;
    
    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      const maxDim = 400;
      let width = video.videoWidth || 400;
      let height = video.videoHeight || 300;
      
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, width, height);
        URL.revokeObjectURL(videoUrl);
        resolve(canvas.toDataURL('image/jpeg', 0.4));
      } else {
        URL.revokeObjectURL(videoUrl);
        resolve('');
      }
    };
    
    video.onerror = () => {
      URL.revokeObjectURL(videoUrl);
      resolve('');
    };
  });
}

interface PlayerViewProps {
  onRefreshTrigger: () => void;
  refreshTrigger: number;
}

export default function PlayerView({ onRefreshTrigger, refreshTrigger }: PlayerViewProps) {
  // Database States
  const [events, setEvents] = useState<Event[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [clues, setClues] = useState<Clue[]>([]);

  // Setup / Identity selectors - restore from sessionStorage
  const [selectedEventId, setSelectedEventId] = useState(() => sessionStorage.getItem('player_eventId') || '');
  const [selectedTeamId, setSelectedTeamId] = useState(() => sessionStorage.getItem('player_teamId') || '');
  const [isPlaying, setIsPlaying] = useState(() => sessionStorage.getItem('player_isPlaying') === 'true');

  // Active Game State
  const [gameState, setGameState] = useState<GameplayState | null>(null);
  
  // Scanned / typed inputs
  const [typedQrCode, setTypedQrCode] = useState('');
  const [qrValidationError, setQrValidationError] = useState('');
  const [isQrValidated, setIsQrValidated] = useState(false);
  const [useCameraScan, setUseCameraScan] = useState(true);

  // States for verification timeouts & validations
  const [isQrCooldown, setIsQrCooldown] = useState(false);
  const [qrSuccessMessage, setQrSuccessMessage] = useState('');
  const [submissionStatus, setSubmissionStatus] = useState<'idle' | 'success_toast' | 'waiting'>('idle');

  // Real Physical QR Code Scanner states
  const [isScannerActive, setIsScannerActive] = useState(false);
  const [scannerErrorMessage, setScannerErrorMessage] = useState('');
  const [scannedValue, setScannedValue] = useState('');
  const qrScannerRef = useRef<Html5Qrcode | null>(null);
  // Container ref to isolate html5-qrcode's DOM manipulation from React's reconciliation.
  // html5-qrcode inserts <video>/<canvas> elements directly into the DOM, which conflicts
  // with React's virtual DOM → causes 'insertBefore' crash on mobile re-renders.
  const qrContainerRef = useRef<HTMLDivElement>(null);

  // Optical Capture/Simulation states
  const [capturedPhotoBase64, setCapturedPhotoBase64] = useState<string | null>(null);
  const [showLiveCamera, setShowLiveCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Media Capture elements
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Refs to avoid stale closures in QR scanner callbacks
  const activeClueRef = useRef<Clue | undefined>(undefined);
  const isQrCooldownRef = useRef(false);

  // Filter clues for active event, sorted by sequence, then shuffled deterministically per team
  const getEventClues = (): Clue[] => {
    const baseClues = clues
      .filter(c => c.eventId === selectedEventId)
      .sort((a, b) => a.sequence - b.sequence);
    
    if (selectedTeamId) {
      return getTeamClueSequence(baseClues, selectedTeamId);
    }
    return baseClues;
  };

  const activeCluesList = getEventClues();
  const activeClue: Clue | undefined = gameState ? activeCluesList[gameState.currentClueIndex] : undefined;

  // Keep refs in sync for QR scanner callbacks
  activeClueRef.current = activeClue;
  isQrCooldownRef.current = isQrCooldown;

  // Persist player session to sessionStorage (survives page reloads)
  useEffect(() => {
    sessionStorage.setItem('player_eventId', selectedEventId);
    sessionStorage.setItem('player_teamId', selectedTeamId);
    sessionStorage.setItem('player_isPlaying', isPlaying ? 'true' : 'false');
  }, [selectedEventId, selectedTeamId, isPlaying]);

  // Reload data
  useEffect(() => {
    const loadedEvents = getEvents();
    const loadedTeams = getTeams();
    const loadedClues = getClues();
    
    setEvents(loadedEvents);
    setTeams(loadedTeams);
    setClues(loadedClues);
  }, [refreshTrigger]);

  // Handle Event choice -> Clear inactive team
  const filteredTeams = teams.filter(t => t.eventId === selectedEventId);

  // Keep game state refreshed and poll for facilitator validation approvals
  useEffect(() => {
    if (!isPlaying || !selectedEventId || !selectedTeamId) return;

    let previousIndex = gameState?.currentClueIndex ?? 0;

    const syncState = () => {
      try {
        const activeState = getGameplay(selectedEventId, selectedTeamId);
        if (activeState) {
          // Ensure photos is always an object (Supabase JSONB might return null)
          if (!activeState.photos || typeof activeState.photos !== 'object') {
            activeState.photos = {};
          }
          setGameState(activeState);

          // Reset waiting flags if no longer pending, but preserve the success celebration toast if it's running
          setSubmissionStatus(prev => {
            if (prev === 'success_toast') return prev;
            return activeState.pendingValidation ? 'waiting' : 'idle';
          });

          const eventClues = getEventClues();
          const currentClue = eventClues[activeState.currentClueIndex];
          if (activeState.currentClueIndex !== previousIndex) {
            // Facilitator approved step advancement! Reset local state variables
            setIsQrValidated(false);
            setCapturedPhotoBase64(null);
            setTypedQrCode('');
            setQrValidationError('');
            setQrSuccessMessage('');
            previousIndex = activeState.currentClueIndex;
          } else if (currentClue && activeState.photos && activeState.photos[currentClue.id]) {
            setIsQrValidated(true);
            setCapturedPhotoBase64(activeState.photos[currentClue.id]);
          } else {
            // If the image was in pending validation but now it's not and has no photo in database,
            // it means the facilitator rejected/invalidated it. Only in this case do we clear the local draft.
            const wasWaiting = gameState?.pendingValidation || submissionStatus === 'waiting';
            const isWaitingNow = activeState.pendingValidation;
            if (wasWaiting && !isWaitingNow) {
              setCapturedPhotoBase64(null);
            }
          }
        } else {
          const newState: GameplayState = {
            eventId: selectedEventId,
            teamId: selectedTeamId,
            currentClueIndex: 0,
            isCompleted: false,
            photos: {},
            startedAt: new Date().toISOString()
          };
          saveGameplay(newState);
          setGameState(newState);
          setIsQrValidated(false);
          setCapturedPhotoBase64(null);
          setSubmissionStatus('idle');
        }
      } catch (err) {
        console.error('[syncState] Error syncing game state:', err);
      }
    };

    syncState();

    const interval = setInterval(syncState, 2000);
    return () => clearInterval(interval);
  }, [isPlaying, selectedEventId, selectedTeamId, gameState?.currentClueIndex, gameState?.pendingValidation, refreshTrigger, submissionStatus]);

  // Clean camera stream on unmount
  useEffect(() => {
    return () => {
      stopCamera();
      if (qrScannerRef.current) {
        try {
          if (qrScannerRef.current.isScanning) {
            qrScannerRef.current.stop();
          }
        } catch (e) {
          console.warn("Error stopping scanner on unmount:", e);
        }
      }
    };
  }, []);

  // Effect to control the physical QR scanner camera instance
  useEffect(() => {
    let html5QrCode: Html5Qrcode | null = null;
    let qrReaderId = '';
    
    if (isScannerActive && !isQrValidated) {
      setScannerErrorMessage('');
      setScannedValue('');
      
      const timer = setTimeout(() => {
        const container = qrContainerRef.current;
        if (container) {
          try {
            // CRITICAL FIX: Create the qr-reader div PROGRAMMATICALLY
            // so React never tries to reconcile html5-qrcode's internal DOM changes.
            // This prevents the 'insertBefore' NotFoundError on mobile.
            container.innerHTML = '';
            const readerDiv = document.createElement('div');
            qrReaderId = 'qr-reader-' + Date.now();
            readerDiv.id = qrReaderId;
            readerDiv.style.width = '100%';
            readerDiv.style.height = '100%';
            container.appendChild(readerDiv);

            html5QrCode = new Html5Qrcode(qrReaderId);
            qrScannerRef.current = html5QrCode;
            
            html5QrCode.start(
              { facingMode: "environment" },
              {
                fps: 10,
                qrbox: (width, height) => {
                  const min = Math.min(width, height);
                  const size = Math.round(min * 0.7);
                  return { width: size, height: size };
                },
                aspectRatio: 1.0
              },
              (decodedText) => {
                if (isQrCooldownRef.current) return;
                const currentClue = activeClueRef.current;
                const detectedCode = decodedText.trim().toUpperCase();
                setScannedValue(detectedCode);
                
                if (currentClue && detectedCode === currentClue.qrCode.toUpperCase()) {
                  setQrSuccessMessage('Sucesso!');
                  setIsQrValidated(true);
                  setQrValidationError('');
                  setIsScannerActive(false);
                  
                  if (html5QrCode?.isScanning) {
                    html5QrCode.stop().catch(e => console.warn(e));
                  }
                } else {
                  setQrValidationError('QR code inválido');
                  setIsQrCooldown(true);
                  isQrCooldownRef.current = true;
                  setTimeout(() => {
                    setIsQrCooldown(false);
                    isQrCooldownRef.current = false;
                    setQrValidationError('');
                  }, 2000);
                }
              },
              () => {
                // Ignore silent scanner frame skip errors
              }
            ).catch(err => {
              console.error("Camera scan start error:", err);
              setScannerErrorMessage("Permissão de câmera negada ou câmera ocupada por outro aplicativo.");
              setIsScannerActive(false);
            });
          } catch (e) {
            console.error("Scanner instantiation error:", e);
            setScannerErrorMessage("Erro ao preparar o scanner.");
            setIsScannerActive(false);
          }
        }
      }, 300);

      return () => {
        clearTimeout(timer);
        if (html5QrCode) {
          const scanner = html5QrCode;
          const cleanup = () => {
            qrScannerRef.current = null;
            // Safely clear the container DOM (outside React's control)
            if (qrContainerRef.current) {
              qrContainerRef.current.innerHTML = '';
            }
          };
          if (scanner.isScanning) {
            scanner.stop().then(cleanup).catch((e) => {
              console.warn('Scanner stop error:', e);
              cleanup();
            });
          } else {
            cleanup();
          }
        }
      };
    }
  }, [isScannerActive, activeClue?.id, isQrValidated]);

  // KEYWORD MATCHING TO ILLUMINATE ACTIVE MOVEMENT DIRECTIONS
  const detectActiveDirections = (commandText: string) => {
    const text = commandText.toUpperCase();
    return {
      left: text.includes('ESQUERDA') || text.includes('ESQUERDO'),
      right: text.includes('DIREITA') || text.includes('DIREITO'),
      forward: text.includes('FRENTE') || text.includes('AVANCE') || text.includes('SUBIR') || text.includes('SUBA'),
      backward: text.includes('ATRÁS') || text.includes('RETROCEDA') || text.includes('VOLTE')
    };
  };

  const directions = activeClue ? detectActiveDirections(activeClue.movementCommand) : { left: false, right: false, forward: false, backward: false };

  // LAUNCH ACTIVE GAMEPLAY
  const handleStartGame = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEventId || !selectedTeamId) {
      alert('Por favor, selecione um Evento e sua correspondente Equipe antes de começar!');
      return;
    }
    setIsPlaying(true);
    onRefreshTrigger();
  };

  // CHECK MANUAL PIN / QR CODE MATCH
  const handleValidateQrCode = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeClue) return;
    if (isQrCooldown) return;

    const trimmedInput = typedQrCode.trim().toUpperCase();
    if (trimmedInput === activeClue.qrCode.toUpperCase()) {
      setQrSuccessMessage('Sucesso!');
      setIsQrValidated(true);
      setQrValidationError('');
      setTypedQrCode('');
    } else {
      setQrValidationError('QR code inválido');
      setIsQrCooldown(true);
      setTimeout(() => {
        setIsQrCooldown(false);
        setQrValidationError('');
      }, 2000);
    }
  };

  // INSTANT MOCK SCANNING IN PREVIEW (Now fully verified via manual entry fallback)
  const handleSimulateScan = () => {
    if (!activeClue) return;
    setTypedQrCode(activeClue.qrCode);
    setQrSuccessMessage('Sucesso!');
    setIsQrValidated(true);
    setQrValidationError('');
  };

  // LIVE WEBCAM CAPTURE LOGIC
  const startCamera = async () => {
    setCameraError(null);
    setShowLiveCamera(true);
    try {
      if (streamRef.current) {
        stopCamera();
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.warn("Camera streaming blocked or not supported:", err);
      setCameraError("Não foi possível acessar a webcam diretamente. Por favor, utilize o simulador de foto ou anexe um arquivo.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setShowLiveCamera(false);
  };

  const captureSnapshot = () => {
    if (!videoRef.current) return;
    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Draw normal snapshot
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Let's stamp a fancy lateral direction watermark to reinforce the theme!
        ctx.fillStyle = 'rgba(16, 185, 129, 0.75)'; // Emerald Transparent
        ctx.font = 'bold 18px Courier New';
        ctx.fillText(`EQUIPE: ${currentSelectedTeamName()}`, 20, canvas.height - 50);
        ctx.fillText(`DESAFIO LATERALIDADE #${activeClue?.sequence}`, 20, canvas.height - 25);
        
        const dataUrl = canvas.toDataURL('image/jpeg', 0.4);
        compressImage(dataUrl, 450, 0.35).then(compressed => {
          setCapturedPhotoBase64(compressed);
          stopCamera();
        });
      }
    } catch (err) {
      alert("Falha ao tirar foto do frame. Tente simular ou enviar arquivo.");
    }
  };

  // STATIC PROCEDURAL CANVAS ILLUSTRATION (Pure Client-side, beautiful simulation!)
  const handleSimulateChallengePhoto = () => {
    if (!activeClue) return;
    
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      // Draw background slate
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 400, 300);
      
      // Draw procedural neon grid
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      for (let i = 0; i < 400; i += 20) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 300); ctx.stroke();
      }
      for (let j = 0; j < 300; j += 20) {
        ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(400, j); ctx.stroke();
      }

      // Draw lateral visual guidance arrow
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(200, 150, 60, 0, Math.PI * 2);
      ctx.stroke();

      // Humanoid stick figure balancing (lateral exercise)
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      // Head
      ctx.beginPath(); ctx.arc(200, 100, 12, 0, Math.PI * 2); ctx.stroke();
      // Body (脊椎)
      ctx.beginPath(); ctx.moveTo(200, 112); ctx.lineTo(200, 170); ctx.stroke();
      // Left arm (elevated)
      ctx.beginPath(); ctx.moveTo(200, 125); ctx.lineTo(160, 95); ctx.stroke();
      // Right arm (angled)
      ctx.beginPath(); ctx.moveTo(200, 125); ctx.lineTo(240, 110); ctx.stroke();
      // Left Leg (folded up/saci)
      ctx.beginPath(); ctx.moveTo(200, 170); ctx.lineTo(185, 195); ctx.lineTo(205, 195); ctx.stroke();
      // Right Leg (standing straight)
      ctx.beginPath(); ctx.moveTo(200, 170); ctx.lineTo(200, 220); ctx.stroke();
      // Ground
      ctx.strokeStyle = '#10b981';
      ctx.beginPath(); ctx.moveTo(150, 220); ctx.lineTo(250, 220); ctx.stroke();

      // Decorative Label
      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(`DESAFIO MOTOR #${activeClue.sequence} CONCLUÍDO`, 80, 45);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px monospace';
      ctx.fillText(`${currentSelectedTeamName()} - LATERALIDADE COMPLETA`, 85, 275);
      
      const imageUrl = canvas.toDataURL('image/jpeg', 0.4);
      compressImage(imageUrl, 450, 0.35).then(compressed => {
        setCapturedPhotoBase64(compressed);
      });
    }
  };

  // UPLOAD FILE AS BASE64 HANDLER supporting photos and videos up to 10 seconds
  // Uses URL.createObjectURL instead of FileReader to avoid loading the full
  // high-resolution image into memory as a Base64 string (which crashes mobile browsers).
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;

      if (file.type.startsWith('video/')) {
        // Create memory video element to check duration
        const videoUrl = URL.createObjectURL(file);
        const tempVideo = document.createElement('video');
        tempVideo.preload = 'metadata';
        tempVideo.src = videoUrl;
        tempVideo.onloadedmetadata = () => {
          URL.revokeObjectURL(videoUrl);
          if (tempVideo.duration > 15.5) { // slightly lenient for 10s limits
            alert('O vídeo deve ter no máximo 15 segundos!');
            return;
          }
          
          // Extract a frame as a readable image proof
          getVideoFrame(file).then(frameUrl => {
            if (frameUrl) {
              setCapturedPhotoBase64(frameUrl);
            } else {
              alert('Falha ao processar vídeo. Tente enviar uma foto ou imagem.');
            }
          }).catch(() => {
            alert('Falha ao processar vídeo. Tente enviar uma foto.');
          });
        };
        tempVideo.onerror = () => {
          URL.revokeObjectURL(videoUrl);
          alert('Falha ao abrir vídeo para verificação de tempo.');
        };
      } else {
        // MOBILE FIX: Use URL.createObjectURL instead of FileReader.readAsDataURL
        // FileReader loads the ENTIRE high-res photo (20-50MB on modern phones)
        // as a Base64 string in memory, which crashes mobile browsers.
        // createObjectURL creates a lightweight binary reference instead.
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          try {
            URL.revokeObjectURL(objectUrl);
            const maxDim = 450;
            let width = img.width;
            let height = img.height;
            if (width > maxDim || height > maxDim) {
              if (width > height) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              } else {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, width, height);
              const compressed = canvas.toDataURL('image/jpeg', 0.35);
              setCapturedPhotoBase64(compressed);
            } else {
              alert('Falha ao processar imagem. Tente novamente.');
            }
          } catch (err) {
            console.error('Image compression error:', err);
            alert('Falha ao processar imagem. Tente uma foto menor.');
          }
        };
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          alert('Falha ao carregar imagem. Tente outro arquivo.');
        };
        img.src = objectUrl;
      }
    } catch (err) {
      console.error('handleFileUpload error:', err);
      alert('Erro ao processar arquivo. Tente novamente.');
    }
  };

  // SAVE PROGRESS AND DEFER STEP UNTIL FACILITATOR MANUALLY APPROVES PROOF (Request 5)
  const handleSaveAndAdvance = async () => {
    try {
      if (!gameState || !activeClue || !capturedPhotoBase64) return;

      // Show instant "sucesso" message on player device
      setSubmissionStatus('success_toast');

      // Upload photo to Supabase Storage and get the public URL
      let photoRef = capturedPhotoBase64; // fallback to base64 if upload fails
      try {
        photoRef = await uploadPhoto(gameState.eventId, gameState.teamId, activeClue.id, capturedPhotoBase64);
      } catch (err) {
        console.error('Photo upload to Supabase Storage failed, using base64 fallback:', err);
      }

      const updatedPhotos = {
        ...gameState.photos,
        [activeClue.id]: photoRef
      };

      const updatedState: GameplayState = {
        ...gameState,
        photos: updatedPhotos,
        pendingValidation: true // Require Facilitator Validation!
      };

      // Save gameplay immediately to database so that there is no polling/timing race condition!
      saveGameplay(updatedState);
      setGameState(updatedState);
      onRefreshTrigger();

      // Exactly 2 seconds later, transition from success_toast to waiting state
      setTimeout(() => {
        setSubmissionStatus('waiting');
      }, 2000);
    } catch (err) {
      console.error('handleSaveAndAdvance error:', err);
      alert('Erro ao salvar prova. Tente novamente.');
      setSubmissionStatus('idle');
    }
  };

  // RESET gameplay states for team
  const handleRestartTeamSession = () => {
    if (confirm('Deseja realmente limpar seu avanço nesta equipe e reiniciar a Caça ao Tesouro do primeiro passo?')) {
      if (selectedEventId && selectedTeamId) {
        deleteGameplay(selectedEventId, selectedTeamId);
        setIsQrValidated(false);
        setCapturedPhotoBase64(null);
        setTypedQrCode('');
        setQrValidationError('');
        
        const newState: GameplayState = {
          eventId: selectedEventId,
          teamId: selectedTeamId,
          currentClueIndex: 0,
          isCompleted: false,
          photos: {},
          startedAt: new Date().toISOString()
        };
        saveGameplay(newState);
        setGameState(newState);
        onRefreshTrigger();
      }
    }
  };

  const currentSelectedTeamName = () => {
    const t = teams.find(item => item.id === selectedTeamId);
    return t ? t.name : 'Equipe Desconhecida';
  };

  const currentSelectedEventName = () => {
    const ev = events.find(item => item.id === selectedEventId);
    return ev ? ev.name : 'Evento';
  };

  return (
    <div className="max-w-md mx-auto space-y-6 pb-12 animate-fade-in" id="player-view-root">
      
      {/* 1. SELECTION CARD: CHOOSE EVENT AND TEAM */}
      {!isPlaying ? (
        <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm relative overflow-hidden" id="card-player-selector">
          
          {/* DECORATIVE LIGHT EFFECT */}
          <div className="absolute top-0 right-0 w-36 h-36 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>

          <div className="flex flex-col items-center text-center space-y-2 mb-6">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100">
              <Smartphone className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-extrabold text-slate-800 font-sans tracking-tight">Iniciar Dinâmica</h2>
            <p className="text-slate-500 text-xs px-4">
              Selecione o evento ativo e o nome da sua equipe cadastrados pelo facilitador para avançar na rota lateral coordenada.
            </p>
          </div>

          <form onSubmit={handleStartGame} className="space-y-4">
            {/* EVENT DROPDOWN */}
            <div>
              <label className="block text-slate-600 text-xs font-semibold mb-1.5 uppercase tracking-wider">
                1. Selecionar o Evento
              </label>
              <select
                value={selectedEventId}
                onChange={e => {
                  setSelectedEventId(e.target.value);
                  setSelectedTeamId('');
                }}
                className="w-full bg-slate-50 border border-slate-250 text-slate-800 text-sm rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all cursor-pointer"
                id="select-player-event"
                required
              >
                <option value="">-- Escolha o Treinamento --</option>
                {events.map(ev => (
                  <option key={ev.id} value={ev.id}>{ev.name}</option>
                ))}
              </select>
            </div>

            {/* TEAM DROPDOWN */}
            <div>
              <label className="block text-slate-600 text-xs font-semibold mb-1.5 uppercase tracking-wider">
                2. Selecionar Sua Equipe
              </label>
              <select
                value={selectedTeamId}
                onChange={e => setSelectedTeamId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-250 text-slate-800 text-sm rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all cursor-pointer"
                id="select-player-team"
                disabled={!selectedEventId}
                required
              >
                <option value="">-- Escolha sua Equipe --</option>
                {filteredTeams.map(tm => (
                  <option key={tm.id} value={tm.id}>{tm.name}</option>
                ))}
              </select>
              {!selectedEventId && (
                <p className="text-[10px] text-slate-400 mt-1">Selecione o evento para liberar as equipes.</p>
              )}
            </div>

            {/* PROCEED ACTION */}
            <button
              type="submit"
              disabled={!selectedEventId || !selectedTeamId}
              className={`w-full inline-flex items-center justify-center gap-2 font-bold px-5 py-3.5 rounded-xl text-sm transition-all shadow-sm cursor-pointer ${
                selectedEventId && selectedTeamId
                  ? 'bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
              }`}
              id="btn-player-start"
            >
              Começar Caça ao Tesouro
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

        </div>
      ) : (
        /* ACTIVE IN-GAME SCREEN WRAPPER */
        <div className="space-y-6">

          {/* ACTIVE GAME STATISTICS HEADER */}
          <div className="bg-white border border-slate-200 p-4 rounded-2xl flex items-center justify-between shadow-sm" id="header-in-game">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm">
                <User className="w-5 h-5 text-indigo-505 text-indigo-605" />
              </div>
              <div className="min-w-0">
                <p className="text-slate-800 font-extrabold text-xs truncate max-w-[170px]">{currentSelectedTeamName()}</p>
                <p className="text-xs text-slate-500 truncate max-w-[170px]">{currentSelectedEventName()}</p>
              </div>
            </div>

            <button
              onClick={() => {
                stopCamera();
                setIsPlaying(false);
              }}
              className="inline-flex items-center gap-1.5 bg-slate-50 text-slate-700 hover:bg-slate-100/90 hover:text-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 text-[10px] font-bold cursor-pointer transition-colors"
               id="btn-player-exit"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Trocar Equipe
            </button>
          </div>

          {/* GAME STATE SHIFTS: VICTORY OR NORMAL PLAY */}
          {gameState?.isCompleted ? (
            
            /* TELA DE VITÓRIA (CONGRAST SCREEN) */
            <div className="bg-white border border-slate-200 p-6 rounded-2xl text-center space-y-6 relative overflow-hidden shadow-sm animate-scale-up" id="player-victory-container">
              <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 to-transparent pointer-events-none"></div>
              
              <div className="flex flex-col items-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-250 flex items-center justify-center text-emerald-600 mb-2 relative">
                  <Trophy className="w-8 h-8 text-emerald-600 animate-bounce" />
                  <SparklingStars />
                </div>
                
                <h1 className="text-2xl font-extrabold font-sans text-emerald-750 text-emerald-700">
                  Parabéns, Campeões!
                </h1>
                <p className="text-slate-600 text-xs px-4 leading-relaxed">
                  Vocês calibraram perfeitamente a lateralidade corporal, seguiram todas as rotas e decifraram os códigos estipulados!
                </p>
              </div>

              {/* STATS CAPSULE */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 text-left">
                <span className="text-[10px] font-bold text-slate-450 block uppercase tracking-wider">
                  Galeria de Desafios Resolvidos ({activeCluesList.length})
                </span>
                
                <div className="grid grid-cols-2 gap-3" id="victory-photos-grid">
                  {activeCluesList.map((cl, idx) => {
                    const snap = gameState.photos[cl.id];
                    return (
                      <div key={cl.id} className="bg-white p-2 rounded-xl border border-slate-200 flex flex-col space-y-1.5">
                        <span className="text-[9px] font-mono font-bold text-emerald-650">Etapa #{cl.sequence} Concluída</span>
                        {snap ? (
                          <img 
                            src={snap} 
                            alt={`Prova ${cl.sequence}`} 
                            className="w-full h-24 object-cover rounded-lg border border-slate-150"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-full h-24 bg-slate-100 flex items-center justify-center text-slate-400 text-xs rounded-lg">[Sem Foto]</div>
                        )}
                        <p className="text-[10px] text-slate-500 truncate leading-relaxed">{cl.motorChallenge}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ACTION TOGGLE */}
              <div className="pt-2">
                <button
                  onClick={handleRestartTeamSession}
                  className="w-full inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-3.2 rounded-xl text-xs transition-transform transform active:scale-95 cursor-pointer shadow-sm"
                  id="btn-restart-from-victory"
                >
                  <RotateCcw className="w-4 h-4" />
                  Jogar Novamente com esta Equipe
                </button>
              </div>

            </div>

          ) : (
            
            /* ACTIVE RUNNING CLUE SCREEN */
            <div className="space-y-6" id="player-active-clue-screen">

              {/* CURRENT PROGRESS DOTS IN ROW & ROTATION INFO */}
              <div className="bg-white border border-slate-200 p-4 rounded-xl space-y-3.5 shadow-sm" id="gameplay-progress-nodes">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-extrabold text-slate-700">Progresso do Percurso:</span>
                    <span className="text-[9px] text-slate-400">Rota exclusiva e otimizada contra aglomerações</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {activeCluesList.map((cl, idx) => {
                      const isPassed = idx < (gameState ? gameState.currentClueIndex : 0);
                      const isCurrent = idx === (gameState ? gameState.currentClueIndex : 0);

                      return (
                        <div 
                          key={cl.id}
                          className={`w-6 h-6 rounded-full font-mono text-[10px] font-extrabold flex flex-col items-center justify-center border transition-all ${
                            isPassed 
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-250 animate-fade-in' 
                              : isCurrent 
                                ? 'bg-indigo-600 text-white border-indigo-600 animate-pulse ring-2 ring-indigo-500/20'
                                : 'bg-slate-50 text-slate-400 border-slate-200'
                          }`}
                          title={`Passo ${idx + 1}`}
                          id={`progress-dot-${cl.id}`}
                        >
                          <span>{idx + 1}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* NO CLUES WARNING GUARD FOR ADMIN RE-MANAGEMENT */}
              {activeCluesList.length === 0 ? (
                <div className="bg-white border border-slate-200 p-8 rounded-2xl text-center space-y-2 shadow-sm">
                  <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
                  <h4 className="text-sm font-extrabold text-slate-700">Nenhuma Pista Cadastrada</h4>
                  <p className="text-slate-400 text-xs px-2 leading-relaxed">
                     O facilitador ainda não cadastrou nenhuma pista para este evento. Acesse o Painel do Administrador na barra de navegação para configurar as rotas corporais!
                  </p>
                </div>
              ) : !activeClue ? (
                <div className="bg-white border border-slate-200 p-8 rounded-2xl text-center shadow-sm">
                  <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
                  <h4 className="text-sm font-extrabold text-slate-700">Desvio Errado</h4>
                  <p className="text-slate-400 text-xs mt-1">Carregando percurso lateral...</p>
                </div>
              ) : (
                <div className="space-y-6">

                  {/* PENDING VALIDATION - SUCCESS TOAST */}
                  <div 
                    style={{ display: (gameState?.pendingValidation || submissionStatus !== 'idle') && submissionStatus === 'success_toast' ? 'block' : 'none' }}
                    className="bg-white border border-slate-200 p-8 rounded-2xl text-center space-y-5 shadow-sm"
                  >
                    <div className="space-y-4 py-6 animate-scale-up">
                      <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto border border-emerald-200 relative">
                        <Check className="w-7 h-7 text-emerald-600" />
                        <span className="absolute inset-0 rounded-full bg-emerald-400/20 animate-ping" style={{ animationDuration: '1.5s' }}></span>
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-base font-extrabold text-emerald-800">Sucesso!</h4>
                        <p className="text-slate-500 text-xs leading-relaxed px-4">
                          Prova enviada com êxito. Preparando solicitação do facilitador...
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* PENDING VALIDATION - WAITING FOR FACILITATOR */}
                  <div 
                    style={{ display: (gameState?.pendingValidation || submissionStatus !== 'idle') && submissionStatus !== 'success_toast' ? 'block' : 'none' }}
                    className="bg-white border border-slate-200 p-8 rounded-2xl text-center space-y-5 shadow-sm"
                  >
                    <div className="space-y-4 py-6 animate-fade-in">
                      <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto border border-amber-250 animate-pulse relative">
                        <Clock className="w-7 h-7 text-amber-600" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-sm font-extrabold text-slate-800">Aguardando a validação da prova</h4>
                        <p className="text-slate-500 text-xs leading-relaxed px-4">
                          O facilitador foi notificado. Aguarde alguns instantes enquanto a rota corporal seguinte está sendo liberada!
                        </p>
                      </div>
                      <div style={{ display: capturedPhotoBase64 ? 'block' : 'none' }}>
                        <div className="mt-4 max-w-[200px] mx-auto rounded-xl overflow-hidden border border-slate-200 shadow-md">
                          {capturedPhotoBase64 && (isVideoMedia(capturedPhotoBase64) ? (
                            <video src={capturedPhotoBase64} className="w-full h-28 object-cover" controls playsInline />
                          ) : (
                            <img src={capturedPhotoBase64} className="w-full h-28 object-cover" />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* GAME CONTENT - shown when NOT pending validation */}
                  <div style={{ display: !(gameState?.pendingValidation || submissionStatus !== 'idle') ? 'block' : 'none' }}>

                    {/* SUB SECTION 1: A ROTA DE LATERALIDADE (MOVEMENT INSTRUCTION) */}
                    <div className="bg-white border border-slate-200 p-5 rounded-2xl relative overflow-hidden shadow-sm" id="card-clue-movement">
                      <span className="text-[10px] font-bold text-indigo-600 block uppercase tracking-wider mb-2">
                        Passo {gameState ? gameState.currentClueIndex + 1 : 1} de {activeCluesList.length}
                      </span>

                      {/* MOVEMENT INSTRUCTION PARAGRAPH WITH DISPLAY FONT */}
                      <p className="text-sm font-semibold text-slate-800 font-sans tracking-wide leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-200">
                        "{activeClue?.movementCommand || ''}"
                      </p>

                      {/* LATERAL DIRECTIONS VISUALIZER (COMPASS) */}
                      <div className="mt-4 border-t border-slate-100 pt-4 flex flex-col items-center">
                        <span className="text-[10px] text-slate-400 font-bold mb-3 block uppercase tracking-wider">Direções Ativas de Lateralidade:</span>
                        
                        {/* INTEGRATED MINI RADAR MAP */}
                        <div className="grid grid-cols-3 gap-2 w-full max-w-[210px] text-center" id="lateral-indicators">
                          <div></div>
                          <div className={`py-1.5 px-2.5 rounded-md text-[10px] border transition-all font-bold uppercase ${
                            directions.forward 
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-300 shadow-sm scale-105' 
                              : 'bg-slate-50 text-slate-400 border-slate-150'
                          }`}>
                            Frente
                          </div>
                          <div></div>
                          
                          <div className={`py-1.5 px-2.5 rounded-md text-[10px] border transition-all font-bold uppercase ${
                            directions.left 
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-300 shadow-sm scale-105' 
                              : 'bg-slate-50 text-slate-400 border-slate-150'
                          }`}>
                            Esquerda
                          </div>
                          <div className="bg-slate-50 rounded-full border border-slate-200 flex items-center justify-center">
                            <Navigation className="w-3.5 h-3.5 text-slate-400 animate-pulse" />
                          </div>
                          <div className={`py-1.5 px-2.5 rounded-md text-[10px] border transition-all font-bold uppercase ${
                            directions.right 
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-300 shadow-sm scale-105' 
                              : 'bg-slate-50 text-slate-400 border-slate-150'
                          }`}>
                            Direita
                          </div>

                          <div></div>
                          <div className={`py-1.5 px-2.5 rounded-md text-[10px] border transition-all font-bold uppercase ${
                            directions.backward 
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-300 shadow-sm scale-105' 
                              : 'bg-slate-50 text-slate-400 border-slate-150'
                          }`}>
                            Trás
                          </div>
                          <div></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* QR CODE VALIDATION SECTION - already converted to display toggle above */}

                  {/* SUB SECTION 3: MOTOR CHALLENGE + PHOTO CAPTURE */}
                  <div style={{ display: isQrValidated ? 'block' : 'none' }}>
                    <div className="bg-white border border-slate-200 p-5 rounded-2xl space-y-4 shadow-sm" id="card-clue-motor-challenge">
                      <span className="text-[10px] font-bold text-indigo-650 block uppercase tracking-wider mb-1">
                        Desafio Motor de Lateralidade Corpórea (Prática)
                      </span>
                      
                      <div className="bg-amber-50/50 border border-amber-200 p-4 rounded-xl space-y-1">
                        <p className="text-xs font-extrabold text-amber-800">Atividade Prática Solicitada:</p>
                        <p className="text-xs font-sans text-slate-700 leading-relaxed font-bold">
                          {activeClue?.motorChallenge || ''}
                        </p>
                      </div>

                      {/* GUIDANCE ALERT */}
                      <div style={{ display: !capturedPhotoBase64 ? 'flex' : 'none' }} className="bg-sky-50 border border-sky-150 p-3.5 rounded-xl items-start gap-2.5 animate-pulse text-sky-900 text-xs shadow-sm">
                        <AlertCircle className="w-4 h-4 shrink-0 text-sky-600 mt-0.5" />
                        <div>
                          <p className="font-bold">Aguardando arquivo de comprovação</p>
                          <p className="text-[10px] text-sky-700 font-medium leading-relaxed">
                            Registre uma foto nítida ou grave um pequeno vídeo de até 10 segundos executando o desafio corporal. O monitor irá analisar este arquivo para liberar a próxima pista!
                          </p>
                        </div>
                      </div>

                      {/* PICTURE CAPTURE WORKFLOW SECTION */}
                      <div className="space-y-4">
                        <label className="block text-slate-655 text-xs font-bold uppercase tracking-wider">
                          Registrar Imagem de Comprovação
                        </label>

                        {/* PHOTO PREVIEW - shown when photo captured */}
                        <div style={{ display: capturedPhotoBase64 ? 'block' : 'none' }}>
                          <div className="relative rounded-xl overflow-hidden border border-indigo-200/80 shadow-sm" id="captured-preview-box">
                            {capturedPhotoBase64 && (isVideoMedia(capturedPhotoBase64) ? (
                              <video 
                                src={capturedPhotoBase64} 
                                className="w-full h-48 object-contain bg-slate-900"
                                controls 
                                playsInline
                              />
                            ) : (
                              <img 
                                src={capturedPhotoBase64} 
                                alt="Comprovação de Desafio" 
                                className="w-full h-48 object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ))}
                            <div className="absolute top-2 right-2 bg-indigo-600 text-white text-[10px] font-bold px-2.5 py-1 rounded shadow-sm flex items-center gap-1 border border-indigo-500">
                              <Check className="w-3 h-3" />
                              ARQUIVO SELECIONADO
                            </div>
                            <div className="absolute bottom-0 inset-x-0 bg-slate-900/95 p-2 text-center flex justify-center gap-2">
                              <button
                                onClick={() => setCapturedPhotoBase64(null)}
                                className="text-rose-400 hover:text-rose-300 text-xs font-bold px-3 py-1 cursor-pointer transition-colors"
                                id="btn-delete-photo"
                              >
                                Excluir Arquivo
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* PHOTO CAPTURE CONTROLS - shown when no photo */}
                        <div style={{ display: !capturedPhotoBase64 ? 'block' : 'none' }}>
                          <div className="space-y-3">
                            
                            {/* ACTIVE CAMERA VISUALIZER STAGE */}
                            <div style={{ display: showLiveCamera ? 'block' : 'none' }}>
                              <div className="bg-slate-950 rounded-xl border border-slate-200 overflow-hidden relative" id="live-camera-stage">
                                <video 
                                  ref={videoRef} 
                                  autoPlay 
                                  playsInline 
                                  className="w-full h-48 object-cover"
                                ></video>
                                <div className="absolute top-2 left-2 text-[10px] bg-indigo-900/80 text-white px-2 py-0.5 rounded flex items-center gap-1.5 font-sans font-semibold border border-indigo-305">
                                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping font-semibold"></span>
                                  Câmera Ativa
                                </div>
                                <div className="absolute bottom-2 inset-x-0 flex justify-center gap-3">
                                  <button
                                    type="button"
                                    onClick={captureSnapshot}
                                    className="bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
                                    id="btn-take-snapshot"
                                  >
                                    <Camera className="w-3.5 h-3.5" />
                                    Tirar Foto
                                  </button>
                                  <button
                                    type="button"
                                    onClick={stopCamera}
                                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg text-xs cursor-pointer"
                                    id="btn-stop-camera"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* NORMAL ACTIONS CARD TRIGGER */}
                            <div style={{ display: !showLiveCamera ? 'grid' : 'none' }} className="grid-cols-2 gap-3" id="photo-triggers-grid">
                              
                              {/* OPEN WEBCAM STREAM */}
                              <button
                                type="button"
                                onClick={startCamera}
                                className="bg-indigo-50/50 hover:bg-indigo-100/90 text-indigo-700 border border-indigo-200/90 p-4 rounded-xl flex flex-col items-center justify-center gap-2 text-center transition-all cursor-pointer"
                                id="btn-trigger-webcam"
                              >
                                <Camera className="w-5 h-5 text-indigo-650" />
                                <span className="text-xs font-bold">Usar Câmera</span>
                                <span className="text-[10px] text-slate-400">Do celular/computador</span>
                              </button>

                              {/* UPLOAD IMAGE OR SHORT VIDEO FILE */}
                              <label className="bg-sky-50/50 hover:bg-sky-100/90 text-sky-700 border border-sky-200/90 p-4 rounded-xl flex flex-col items-center justify-center gap-2 text-center cursor-pointer transition-all">
                                <Upload className="w-5 h-5 text-sky-650" />
                                <span className="text-xs font-bold">Anexar Foto / Vídeo</span>
                                <span className="text-[10px] text-slate-400 font-semibold">Vídeos com máx 10 segundos</span>
                                <input 
                                  type="file" 
                                  accept="image/*,video/*"
                                  capture="environment"
                                  onChange={handleFileUpload}
                                  className="hidden" 
                                />
                              </label>

                            </div>

                            <div style={{ display: cameraError ? 'block' : 'none' }}>
                              <p className="text-amber-700 text-[10px] bg-amber-50 p-2.5 rounded-lg border border-amber-250">
                                {cameraError}
                              </p>
                            </div>

                            {/* BACKUP INSTANT ILLUSTRATIVE GENERATION */}
                            <div className="pt-1">
                              <button
                                type="button"
                                onClick={handleSimulateChallengePhoto}
                                className="w-full inline-flex items-center justify-center gap-1 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-amber-700 text-[10px] py-1.5 rounded-lg border border-slate-200 font-mono transition-colors cursor-pointer"
                                id="btn-draw-mock-photo"
                              >
                                <Sparkle className="w-3 h-3 text-amber-500 animate-pulse" />
                                Simular Captura Motorizada (Backup)
                              </button>
                            </div>

                          </div>
                        </div>

                      </div>

                      {/* ADVANCE TO NEXT STEP TRIGGERS */}
                      <div className="pt-2 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={handleSaveAndAdvance}
                          disabled={!capturedPhotoBase64}
                          className={`w-full inline-flex items-center justify-center gap-1.5 font-bold px-4 py-3.5 rounded-xl text-xs transition-colors cursor-pointer shadow-sm ${
                            capturedPhotoBase64
                              ? 'bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white'
                              : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                          }`}
                          id="btn-player-advance"
                        >
                          Salvar Desafio e Avançar
                          <ArrowRight className="w-4 h-4" />
                        </button>
                        <p style={{ display: !capturedPhotoBase64 ? 'block' : 'none' }} className="text-[10px] text-slate-400 font-medium text-center mt-1.5">
                          Submeta ou simule a imagem comprobatória para liberar o avanço corporal.
                        </p>
                      </div>

                    </div>
                  </div>

                  {/* RESET BUTTON */}
                  <div className="pt-2 text-center" id="session-restart-underlay">
                    <button
                      type="button"
                      onClick={handleRestartTeamSession}
                      className="text-slate-400 hover:text-rose-600 transition-colors text-[10px] font-bold underline underline-offset-4 cursor-pointer inline-flex items-center gap-1"
                      id="btn-player-reset-all"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reiniciar progresso desta equipe
                    </button>
                  </div>

                </div>
              )}



            </div>
          )}

        </div>
      )}

    </div>
  );
}

// Sparkle element helper to populate high-fidelity trophy view
function SparklingStars() {
  return (
    <>
      <span className="absolute top-0 right-0 text-amber-400 animate-ping delay-75"><Sparkles className="w-3.5 h-3.5" /></span>
      <span className="absolute bottom-1 left-0 text-emerald-400 animate-ping delay-500"><Sparkles className="w-3.5 h-3.5" /></span>
    </>
  );
}
