import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import type { WorldPlacement } from '@tbn/contracts';
import type { ReactNode } from 'react';
import { BoxGeometry, CylinderGeometry, MeshStandardMaterial } from 'three';
import { CORK_SIZE, GADGET_SPOTS } from '@/game/props/gadgets';
import { clockAngles, type LiveData } from './liveData';

/** Props of `LiveProps`. */
export interface LivePropsProps {
  placements: readonly WorldPlacement[];
  live: LiveData;
  hour: number;
  /** Called with a prop's id when its live part is clicked; build mode selects it. */
  onPick?: (placementId: string) => void;
}

const PAPER = new MeshStandardMaterial({ color: '#f7f5ef', roughness: 0.9 });
const CARD_COLORS = ['#fde68a', '#bfdbfe', '#fecaca', '#bbf7d0', '#e9d5ff', '#fed7aa'];
const CARDS = CARD_COLORS.map((color) => new MeshStandardMaterial({ color, roughness: 0.9 }));
const LIGHT_ON = new MeshStandardMaterial({ color: '#22c55e', emissive: '#22c55e' });
const LIGHT_OFF = new MeshStandardMaterial({ color: '#1f2937', roughness: 0.6 });
const HAND = new MeshStandardMaterial({ color: '#1f2937' });
const GOLD = new MeshStandardMaterial({ color: '#e0a23a', metalness: 0.6, roughness: 0.35 });
const CARD = new BoxGeometry(0.28, 0.22, 0.004);
const LIGHT = new BoxGeometry(0.05, 0.03, 0.01);
const CUP = new CylinderGeometry(0.07, 0.04, 0.14, 8);
const STEM = new CylinderGeometry(0.015, 0.015, 0.06, 6);
const BASE = new BoxGeometry(0.1, 0.03, 0.1);
/** The rack's lights: four across, six down. */
const RACK_COLUMNS = 4;
const RACK_LIGHTS = 24;
/** A paper's thickness in the tray, and the most papers it stacks. */
const SHEET = 0.004;
const MOST_SHEETS = 40;

function Inbox({ waiting }: { waiting: number }) {
  if (waiting === 0) return null;
  const height = SHEET * Math.min(waiting, MOST_SHEETS);
  const [x, y, z] = GADGET_SPOTS.inboxPaper;
  return (
    <mesh material={PAPER} position={[x, y - 0.02 + height / 2, z]} castShadow>
      <boxGeometry args={[0.3, height, 0.22]} />
    </mesh>
  );
}

function Cork({ count }: { count: number }) {
  const [x, y, z] = GADGET_SPOTS.corkFace;
  return (
    <>
      {CARDS.slice(0, count).map((material, index) => (
        <mesh
          key={index}
          geometry={CARD}
          material={material}
          position={[
            x - CORK_SIZE[0] / 3 + (index % 3) * (CORK_SIZE[0] / 3),
            y + CORK_SIZE[1] / 4 - Math.floor(index / 3) * (CORK_SIZE[1] / 2),
            z,
          ]}
          rotation-z={((index % 2 === 0 ? 1 : -1) * Math.PI) / 60}
        />
      ))}
    </>
  );
}

function Rack({ running }: { running: number }) {
  const [x, y, z] = GADGET_SPOTS.rackLight;
  const [stepX, stepY] = GADGET_SPOTS.rackStep;
  return (
    <>
      {Array.from({ length: RACK_LIGHTS }, (_, index) => (
        <mesh
          key={index}
          geometry={LIGHT}
          material={index < running ? LIGHT_ON : LIGHT_OFF}
          position={[
            x + (index % RACK_COLUMNS) * stepX,
            y + Math.floor(index / RACK_COLUMNS) * stepY,
            z,
          ]}
        />
      ))}
    </>
  );
}

function Clock({ hour }: { hour: number }) {
  const angles = clockAngles(hour);
  const [x, y, z] = GADGET_SPOTS.clockFace;
  return (
    <group position={[x, y, z]}>
      <group rotation-z={-angles.hour}>
        <mesh material={HAND} position={[0, 0.06, 0]}>
          <boxGeometry args={[0.025, 0.13, 0.01]} />
        </mesh>
      </group>
      <group rotation-z={-angles.minute}>
        <mesh material={HAND} position={[0, 0.09, 0.008]}>
          <boxGeometry args={[0.015, 0.19, 0.01]} />
        </mesh>
      </group>
    </group>
  );
}

function Trophies({ reached }: { reached: number }) {
  const [x, y, z] = GADGET_SPOTS.trophyBase;
  return (
    <>
      {Array.from({ length: reached }, (_, index) => (
        <group key={index} position={[x + index * GADGET_SPOTS.trophyStep, y, z]}>
          <mesh geometry={BASE} material={GOLD} position={[0, 0.015, 0]} castShadow />
          <mesh geometry={STEM} material={GOLD} position={[0, 0.06, 0]} />
          <mesh geometry={CUP} material={GOLD} position={[0, 0.16, 0]} castShadow />
        </group>
      ))}
    </>
  );
}

/** The live part of one placement, in its own frame, or null for a kind that has none. */
function liveOf(placement: WorldPlacement, live: LiveData, hour: number): ReactNode {
  switch (placement.kind) {
    case 'inbox_tray':
      return <Inbox waiting={live.pendingApprovals} />;
    case 'cork_board':
      return <Cork count={live.pinned.length} />;
    case 'server_rack':
      return <Rack running={live.runningJobs} />;
    case 'wall_clock':
      return <Clock hour={hour} />;
    case 'trophy_shelf':
      return <Trophies reached={live.milestones.filter((one) => one.isReached).length} />;
    default:
      return null;
  }
}

/**
 * The parts of the company's objects that follow its data: the papers waiting in the inbox, a
 * card for each pinned report, a blinking light for each running sandbox job, the clock's hands
 * at the world's hour, and a trophy for each milestone reached.
 */
export function LiveProps({ placements, live, hour, onPick }: LivePropsProps) {
  const invalidate = useThree((state) => state.invalidate);
  useFrame(({ clock }) => {
    if (live.runningJobs === 0) return;
    LIGHT_ON.emissiveIntensity = 0.4 + 0.6 * Math.abs(Math.sin(clock.elapsedTime * 3));
    invalidate();
  });
  return (
    <>
      {placements.map((placement) => {
        const part = liveOf(placement, live, hour);
        if (part === null) return null;
        return (
          <group
            key={placement.id}
            position={[placement.x, 0, placement.z]}
            rotation-y={(placement.yaw_deg * Math.PI) / 180}
            onClick={(event: ThreeEvent<MouseEvent>) => {
              if (onPick === undefined) return;
              event.stopPropagation();
              onPick(placement.id);
            }}
          >
            {part}
          </group>
        );
      })}
    </>
  );
}
