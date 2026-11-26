import type { GameController } from './controller';
import type { StationId } from './types';

export type DirectSceneAction =
  | { kind: 'pad'; station: StationId; label: string }
  | { kind: 'astrolabe-ring'; ringIndex: number; label: string }
  | { kind: 'mirror'; mirrorIndex: number; label: string }
  | { kind: 'chime'; slotIndex: number; label: string }
  | { kind: 'chime-gong'; label: string }
  | { kind: 'apex-crown'; label: string };

export interface DirectInteractionHooks {
  onTeleportPad?: (station: StationId) => void;
}

/**
 * Pure, testable 3D raycast direct-manipulation dispatcher shared by Orbit & Walk modes.
 * Allows direct 3D clicking on bronze gear rings, mirror obelisks, temple bells, gong, and
 * the Solstice Apex Crown without forcing unwanted camera teleports.
 */
export function dispatchDirect3DAction(
  controller: GameController,
  action: DirectSceneAction,
  hooks?: DirectInteractionHooks,
): boolean {
  const snap = controller.getSnapshot();
  if (snap.phase !== 'playing' && snap.phase !== 'sandbox') {
    return false;
  }

  switch (action.kind) {
    case 'pad':
      controller.setStation(action.station);
      hooks?.onTeleportPad?.(action.station);
      return true;
    case 'astrolabe-ring':
      controller.rotateAstrolabe(action.ringIndex, 1);
      return true;
    case 'mirror':
      controller.rotateMirror(action.mirrorIndex, 1);
      return true;
    case 'chime':
      controller.strikeChime(action.slotIndex);
      return true;
    case 'chime-gong':
      controller.requestChimePulse();
      return true;
    case 'apex-crown':
      controller.triggerApexCrown();
      return true;
  }
}
