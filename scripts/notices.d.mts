export const ALLOWED: string[];
export type NoticeData = {
  packages: {
    name: string;
    title: string;
    version: string;
    licence: string;
    copyright: string;
    text: number;
    where: ("cli" | "page" | "maths" | "code" | "font")[];
  }[];
  texts: { licence: string; body: string }[];
};
export function collect(): Promise<NoticeData>;
export function problems(data: NoticeData): string[];
export function render(data: NoticeData, own: string): string;
export function generate(): Promise<{ data: NoticeData; text: string; module: string }>;
