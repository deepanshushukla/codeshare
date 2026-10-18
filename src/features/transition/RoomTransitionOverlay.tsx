import { useRoomTransition } from './RoomTransitionProvider';
import styles from './RoomTransitionOverlay.module.scss';

// Full-screen "iris" transition shown while a new room is being created
// (handoff `CodeShare v2.dc.html` lines 316-322). Renders nothing while
// inactive, so it adds no DOM overhead outside of a room-creation transition.
export default function RoomTransitionOverlay() {
  const { active, roomId } = useRoomTransition();

  if (!active) {
    return null;
  }

  return (
    <div className={styles.layer}>
      <div className={styles.fill}>
        <span className={styles.label}>/r/{roomId}</span>
      </div>
    </div>
  );
}
