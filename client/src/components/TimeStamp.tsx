import { formatDateTime, formatRelative } from '@/lib/format/time';
import { useTimeZone } from '@/lib/data/queries';

/** Props of `TimeStamp`. */
export interface TimeStampProps {
  iso: string;
  /** Shows the date and time instead of how long ago. */
  isAbsolute?: boolean;
}

/** An instant as a `<time>`: how long ago, with the full date in the owner's time zone on hover. */
export function TimeStamp({ iso, isAbsolute = false }: TimeStampProps) {
  const timeZone = useTimeZone();
  const full = formatDateTime(iso, timeZone);
  return (
    <time dateTime={iso} title={full} className="whitespace-nowrap">
      {isAbsolute ? full : formatRelative(iso)}
    </time>
  );
}
