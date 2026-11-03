export interface HourOption {
  value: number;
  label: string;
}

// Full 24-hour options from 12:00 AM (0) to 11:00 PM (23)
export const ALL_24_HOURS: HourOption[] = Array.from({ length: 24 }, (_, i) => {
  const h = i % 12 === 0 ? 12 : i % 12;
  const ampm = i < 12 ? 'AM' : 'PM';
  return {
    value: i,
    label: `${h}:00 ${ampm}`,
  };
});

export const formatHour = (hour: number): string => {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour < 12 ? 'AM' : 'PM';
  return `${h}:00 ${ampm}`;
};

