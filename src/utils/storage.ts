/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Event, Team, Clue, GameplayState } from '../types';
import { INITIAL_EVENTS, INITIAL_TEAMS, INITIAL_CLUES } from '../mockData';
import { supabase } from './supabase';

// Storage keys
const KEY_EVENTS = 'lateral_hunt_events';
const KEY_TEAMS = 'lateral_hunt_teams';
const KEY_CLUES = 'lateral_hunt_clues';
const KEY_GAMEPLAY = 'lateral_hunt_gameplay';

export function initializeStorage() {
  if (!localStorage.getItem(KEY_EVENTS)) {
    localStorage.setItem(KEY_EVENTS, JSON.stringify(INITIAL_EVENTS));
  }
  if (!localStorage.getItem(KEY_TEAMS)) {
    localStorage.setItem(KEY_TEAMS, JSON.stringify(INITIAL_TEAMS));
  }
  if (!localStorage.getItem(KEY_CLUES)) {
    localStorage.setItem(KEY_CLUES, JSON.stringify(INITIAL_CLUES));
  }
}

// EVENTS HELPERS
export function getEvents(): Event[] {
  initializeStorage();
  const raw = localStorage.getItem(KEY_EVENTS);
  return raw ? JSON.parse(raw) : [];
}

export function saveEvents(events: Event[]): void {
  // 1. Identify and delete removed items
  const previous = getEvents();
  const currentIds = new Set(events.map(e => e.id));
  const removedIds = previous.filter(p => !currentIds.has(p.id)).map(p => p.id);

  if (removedIds.length > 0) {
    supabase
      .from('events')
      .delete()
      .in('id', removedIds)
      .then(({ error }) => {
        if (error) console.error('[Supabase] Error deleting events:', error.message);
      })
      .catch(err => console.error('[Supabase] Error deleting events:', err));
  }

  // 2. Save to localStorage immediately
  localStorage.setItem(KEY_EVENTS, JSON.stringify(events));

  // 3. Upsert current events to Supabase
  if (events.length > 0) {
    supabase
      .from('events')
      .upsert(events, { onConflict: 'id' })
      .then(({ error }) => {
        if (error) console.error('[Supabase] Error upserting events:', error.message);
      })
      .catch(err => console.error('[Supabase] Error upserting events:', err));
  }
}

// TEAMS HELPERS
export function getTeams(): Team[] {
  initializeStorage();
  const raw = localStorage.getItem(KEY_TEAMS);
  return raw ? JSON.parse(raw) : [];
}

export function saveTeams(teams: Team[]): void {
  // 1. Identify and delete removed items
  const previous = getTeams();
  const currentIds = new Set(teams.map(t => t.id));
  const removedIds = previous.filter(p => !currentIds.has(p.id)).map(p => p.id);

  if (removedIds.length > 0) {
    supabase
      .from('teams')
      .delete()
      .in('id', removedIds)
      .then(({ error }) => {
        if (error) console.error('[Supabase] Error deleting teams:', error.message);
      })
      .catch(err => console.error('[Supabase] Error deleting teams:', err));
  }

  // 2. Save to localStorage immediately
  localStorage.setItem(KEY_TEAMS, JSON.stringify(teams));

  // 3. Upsert current teams to Supabase
  if (teams.length > 0) {
    supabase
      .from('teams')
      .upsert(teams, { onConflict: 'id' })
      .then(({ error }) => {
        if (error) console.error('[Supabase] Error upserting teams:', error.message);
      })
      .catch(err => console.error('[Supabase] Error upserting teams:', err));
  }
}

// CLUES HELPERS
export function getClues(): Clue[] {
  initializeStorage();
  const raw = localStorage.getItem(KEY_CLUES);
  return raw ? JSON.parse(raw) : [];
}

export function saveClues(clues: Clue[]): void {
  // 1. Identify and delete removed items
  const previous = getClues();
  const currentIds = new Set(clues.map(c => c.id));
  const removedIds = previous.filter(p => !currentIds.has(p.id)).map(p => p.id);

  if (removedIds.length > 0) {
    supabase
      .from('clues')
      .delete()
      .in('id', removedIds)
      .then(({ error }) => {
        if (error) console.error('[Supabase] Error deleting clues:', error.message);
      })
      .catch(err => console.error('[Supabase] Error deleting clues:', err));
  }

  // 2. Save to localStorage immediately
  localStorage.setItem(KEY_CLUES, JSON.stringify(clues));

  // 3. Upsert current clues to Supabase
  if (clues.length > 0) {
    supabase
      .from('clues')
      .upsert(clues, { onConflict: 'id' })
      .then(({ error }) => {
        if (error) console.error('[Supabase] Error upserting clues:', error.message);
      })
      .catch(err => console.error('[Supabase] Error upserting clues:', err));
  }
}

// GAMEPLAY PROGRESS HELPERS
export function getGameplayStates(): GameplayState[] {
  const raw = localStorage.getItem(KEY_GAMEPLAY);
  return raw ? JSON.parse(raw) : [];
}

export function getGameplay(eventId: string, teamId: string): GameplayState | null {
  const states = getGameplayStates();
  const state = states.find(s => s.eventId === eventId && s.teamId === teamId);
  return state || null;
}

export function saveGameplay(state: GameplayState): void {
  // 1. Save locally
  const states = getGameplayStates();
  const index = states.findIndex(s => s.eventId === state.eventId && s.teamId === state.teamId);

  if (index >= 0) {
    states[index] = state;
  } else {
    states.push(state);
  }
  localStorage.setItem(KEY_GAMEPLAY, JSON.stringify(states));

  // 2. Mirror to Supabase
  const docId = `${state.eventId}_${state.teamId}`;
  supabase
    .from('gameplay_states')
    .upsert({ id: docId, ...state }, { onConflict: 'id' })
    .then(({ error }) => {
      if (error) console.error('[Supabase] Error upserting gameplay_states:', error.message);
    })
    .catch(err => console.error('[Supabase] Error upserting gameplay_states:', err));
}

export function deleteGameplay(eventId: string, teamId: string): void {
  // 1. Delete locally
  const states = getGameplayStates();
  const filtered = states.filter(s => !(s.eventId === eventId && s.teamId === teamId));
  localStorage.setItem(KEY_GAMEPLAY, JSON.stringify(filtered));

  // 2. Delete from Supabase
  const docId = `${eventId}_${teamId}`;
  supabase
    .from('gameplay_states')
    .delete()
    .eq('id', docId)
    .then(({ error }) => {
      if (error) console.error('[Supabase] Error deleting gameplay_states:', error.message);
    })
    .catch(err => console.error('[Supabase] Error deleting gameplay_states:', err));
}

// Seed / Reset implementation
export function resetAllData(): void {
  // Save locally
  localStorage.setItem(KEY_EVENTS, JSON.stringify(INITIAL_EVENTS));
  localStorage.setItem(KEY_TEAMS, JSON.stringify(INITIAL_TEAMS));
  localStorage.setItem(KEY_CLUES, JSON.stringify(INITIAL_CLUES));
  localStorage.setItem(KEY_GAMEPLAY, JSON.stringify([]));

  // Clean all Supabase tables and re-insert mock data
  supabase.from('gameplay_states').delete().neq('id', '')
    .then(({ error }) => {
      if (error) console.error('[Supabase] Error clearing gameplay_states:', error.message);
    })
    .catch(err => console.error('[Supabase] Error clearing gameplay_states:', err));

  supabase.from('events').delete().neq('id', '')
    .then(() => {
      supabase.from('events').upsert(INITIAL_EVENTS, { onConflict: 'id' })
        .then(({ error }) => {
          if (error) console.error('[Supabase] Error seeding events:', error.message);
        })
        .catch(err => console.error('[Supabase] Error seeding events:', err));
    })
    .catch(err => console.error('[Supabase] Error clearing events:', err));

  supabase.from('teams').delete().neq('id', '')
    .then(() => {
      supabase.from('teams').upsert(INITIAL_TEAMS, { onConflict: 'id' })
        .then(({ error }) => {
          if (error) console.error('[Supabase] Error seeding teams:', error.message);
        })
        .catch(err => console.error('[Supabase] Error seeding teams:', err));
    })
    .catch(err => console.error('[Supabase] Error clearing teams:', err));

  supabase.from('clues').delete().neq('id', '')
    .then(() => {
      supabase.from('clues').upsert(INITIAL_CLUES, { onConflict: 'id' })
        .then(({ error }) => {
          if (error) console.error('[Supabase] Error seeding clues:', error.message);
        })
        .catch(err => console.error('[Supabase] Error seeding clues:', err));
    })
    .catch(err => console.error('[Supabase] Error clearing clues:', err));
}

/**
 * Uploads a photo to Supabase Storage and returns its public URL.
 */
export async function uploadPhoto(
  eventId: string,
  teamId: string,
  clueId: string,
  base64Data: string
): Promise<string> {
  const blob = await fetch(base64Data).then(r => r.blob());
  const path = `${eventId}/${teamId}/${clueId}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from('photos')
    .upload(path, blob, { upsert: true });

  if (uploadError) {
    throw new Error(`[Supabase Storage] Upload failed: ${uploadError.message}`);
  }

  const { data } = supabase.storage.from('photos').getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Generates a stable, team-specific clue sequence using a deterministic pseudo-random shuffle
 * based on the team's ID. This prevents teams from clustering at the same spots.
 */
export function getTeamClueSequence(clues: Clue[], teamId: string): Clue[] {
  if (clues.length <= 1 || !teamId) return clues;

  // Generate a deterministic numerical hash from the teamId
  let hash = 0;
  for (let i = 0; i < teamId.length; i++) {
    hash = teamId.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Clone and sort by original sequence first to ensure start baseline is consistent
  const result = [...clues].sort((a, b) => a.sequence - b.sequence);

  // Seed-based pseudo-random generator (using sine wave mapping)
  let seed = Math.abs(hash) || 88888888;
  const seededRandom = () => {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  };

  // Fisher-Yates shuffle with our seeded pseudo-random supply
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom() * (i + 1));
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }

  return result;
}
