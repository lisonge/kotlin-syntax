export interface Request { version: number; source: string; script: boolean; moduleUrl: string }
export interface Result { version: number; spans?: number[]; elapsed?: number; error?: string }
