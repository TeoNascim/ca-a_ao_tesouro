/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Event, Team, Clue } from './types';

export const INITIAL_EVENTS: Event[] = [
  {
    id: 'evt-1',
    name: 'Formação Coordenadores 2026',
    date: '2026-05-15',
  },
  {
    id: 'evt-2',
    name: 'Treinamento de Professores',
    date: '2026-06-01',
  }
];

export const INITIAL_TEAMS: Team[] = [
  // Event 1 Teams
  { id: 'team-1', eventId: 'evt-1', name: 'Equipe Alfa (Saci)' },
  { id: 'team-2', eventId: 'evt-1', name: 'Equipe Beta (Lince)' },
  { id: 'team-3', eventId: 'evt-1', name: 'Equipe Gama (Guerreiros)' },
  
  // Event 2 Teams
  { id: 'team-4', eventId: 'evt-2', name: 'Grupo Azul' },
  { id: 'team-5', eventId: 'evt-2', name: 'Grupo Verde' }
];

export const INITIAL_CLUES: Clue[] = [
  // Event 1 Clues
  {
    id: 'clue-1',
    eventId: 'evt-1',
    sequence: 1,
    movementCommand: 'Dê 8 passos à frente no corredor principal, vire 90° à ESQUERDA e dê mais 4 passos lentos desviando das cadeiras.',
    qrCode: 'QR_SAIDA_01',
    motorChallenge: 'Tire uma foto de toda a equipe equilibrando-se apenas sobre o pé ESQUERDO com as mãos na cintura (postura do Saci).',
  },
  {
    id: 'clue-2',
    eventId: 'evt-1',
    sequence: 2,
    movementCommand: 'Olhando para a estátua central, movimente-se 6 passos para a sua DIREITA (em deslocamento lateral), depois caminhe 4 passos para trás.',
    qrCode: 'QR_PATIO_02',
    motorChallenge: 'Tire uma foto levantando a mão DIREITA e tocando a orelha ESQUERDA com o dedo indicador.',
  },
  {
    id: 'clue-3',
    eventId: 'evt-1',
    sequence: 3,
    movementCommand: 'Siga até o mural de avisos, vire à DIREITA, execute um salto completo de 180° e caminhe 5 passos rápidos à frente.',
    qrCode: 'QR_RELO_03',
    motorChallenge: 'Tire uma foto da equipe na postura de Yoga (Árvore): pé esquerdo apoiado à altura do joelho direito e palmas unidas acima da cabeça.',
  },

  // Event 2 Clues
  {
    id: 'clue-4',
    eventId: 'evt-2',
    sequence: 1,
    movementCommand: 'Saia pela porta da recepção principal, dê 12 passos à ESQUERDA e mude seu olhar 90° à DIREITA.',
    qrCode: 'QR_RECEPCAO_A',
    motorChallenge: 'Tire uma foto em dupla fazendo o "movimento de espelho" (braço esquerdo de um esticado, braço direito do outro espelhando).',
  },
  {
    id: 'clue-5',
    eventId: 'evt-2',
    sequence: 2,
    movementCommand: 'Siga em direção à quadra esportiva, avance 8 passos saltitando sobre o pé DIREITO e pare em frente à linha branca.',
    qrCode: 'QR_QUADRA_B',
    motorChallenge: 'Tire uma foto coletiva apontando todos os sapatos ESQUERDOS em direção ao ponto central da câmera.',
  }
];
