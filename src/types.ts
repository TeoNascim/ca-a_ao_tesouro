/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Event {
  id: string;
  name: string;
  date: string;
}

export interface Team {
  id: string;
  eventId: string;
  name: string;
}

export interface Clue {
  id: string;
  eventId: string;
  sequence: number;
  movementCommand: string; // Ex: "Dê 5 passos para a direita, depois vire à esquerda e ande 3 passos."
  qrCode: string;          // Ex: "QR-SALA-A1"
  motorChallenge: string;  // Ex: "Apoie-se apenas na perna direita com os olhos fechados por 10 segundos."
}

export interface GameplayState {
  eventId: string;
  teamId: string;
  currentClueIndex: number;
  isCompleted: boolean;
  photos: Record<string, string>; // clueId -> Base64 dataUrl of captured photo
  startedAt: string;
  completedAt?: string;
  pendingValidation?: boolean; // Is currently waiting for Admin approval
}
