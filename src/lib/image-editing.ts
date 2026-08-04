export type EditLock = 'person' | 'composition' | 'text';

const EDIT_LOCK_PROMPTS: Record<EditLock, string> = {
  person: '保持原图人物身份、面部特征、发型和姿势不变。',
  composition: '保持原图构图、镜头视角和画面比例不变。',
  text: '保留原图中已有文字内容和排版，不要修改。',
};

export function buildImageEditPrompt(instruction: string, locks: Iterable<EditLock>): string {
  const constraints = Array.from(locks, (lock) => EDIT_LOCK_PROMPTS[lock]).join('');
  return `${constraints}用户修改要求：${instruction.trim()}`;
}
