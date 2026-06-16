/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ShieldCheck, Compass, Smartphone, Laptop, Clock } from 'lucide-react';

interface HeaderProps {
  currentView: 'admin' | 'player';
  onViewChange: (view: 'admin' | 'player') => void;
}

export default function Header({ currentView, onViewChange }: HeaderProps) {
  return (
    <header className="bg-white/95 border-b border-slate-200 sticky top-0 z-40 backdrop-blur-md" id="app-header">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          
          {/* APP BRANDING WITH NEON EMBELLISHMENT */}
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-xl shadow-md shadow-indigo-500/10 flex items-center justify-center text-slate-100">
              <Compass className="w-6 h-6 animate-spin-slow" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-800 font-sans tracking-tight flex items-center gap-1.5 leading-none">
                Laterallis
                <span className="text-[9px] font-bold bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded border border-indigo-200 shrink-0">
                  v1.2
                </span>
              </h1>
              <p className="text-[10px] text-slate-500 mt-1 font-sans">
                Dinâmicas Pedagógicas de Lateralidade & Corpo
              </p>
            </div>
          </div>

          {/* TOGGLE SELECTOR BUTTONS */}
          <div className="flex items-center bg-slate-150 border border-slate-200 p-1 rounded-xl w-full sm:w-auto" id="toggle-header-views">
            
            {/* GO TO PLAYER VIEW */}
            <button
              onClick={() => onViewChange('player')}
              className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                currentView === 'player'
                  ? 'bg-indigo-600 text-white shadow-sm transform scale-[1.02]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
              id="btn-switch-player"
            >
              <Smartphone className="w-4 h-4" />
              Modo Jogador
            </button>

            {/* GO TO ADMIN VIEW */}
            <button
              onClick={() => onViewChange('admin')}
              className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                currentView === 'admin'
                  ? 'bg-indigo-600 text-white shadow-sm transform scale-[1.02]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
              id="btn-switch-admin"
            >
              <ShieldCheck className="w-4 h-4" />
              Painel do Administrador
            </button>

          </div>

        </div>

      </div>
    </header>
  );
}
