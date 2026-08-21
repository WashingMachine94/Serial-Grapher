export interface Preset {
  label: string;
  pattern: string;
}

export const regexPresets: Preset[] = [
  { label: 'ESP_LOG_I', pattern: '(?<=\\[)\\s*\\d+(?=\\])|[+-]?\\d+\\.\\d+' },
  { label: 'CSV (comma separated)', pattern: '[^,]+' },
  { label: 'Space separated numbers', pattern: '[+-]?\\d+\\.?\\d*' },
];