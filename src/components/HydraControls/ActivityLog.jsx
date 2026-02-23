/* ============================================================
   HYDRA — Activity Log (last 8 events)
   ============================================================ */

export default function ActivityLog({ activity }) {
  if (!activity || activity.length === 0) {
    return (
      <div className="hydra-activity">
        <div className="hydra-activity-empty">No activity yet. Enable HYDRA to start scoring.</div>
      </div>
    );
  }

  return (
    <div className="hydra-activity">
      {activity.slice(0, 8).map((entry, i) => {
        const time = new Date(entry.timestamp).toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });

        const isEntry = entry.message?.includes('ENTRY FIRED');
        const isExit = entry.message?.includes('closed');
        const isBlocked = entry.message?.includes('BLOCKED');
        const isAdjust = entry.message?.includes('adjusted');

        const cls = isEntry ? 'entry' : isExit ? 'exit' : isBlocked ? 'blocked' : isAdjust ? 'adjust' : 'info';

        return (
          <div key={entry.timestamp + '-' + i} className={`hydra-activity-entry ${cls}`}>
            <span className="hydra-activity-time">{time}</span>
            <span className="hydra-activity-msg">{entry.message}</span>
          </div>
        );
      })}
    </div>
  );
}
