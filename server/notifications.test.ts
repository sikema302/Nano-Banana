import assert from 'node:assert/strict';
import test from 'node:test';

import { createNotificationService } from './notifications.js';

function createMemoryStore() {
  const values = new Map<string, string>();
  return {
    get: async (key: string, fallback: string) => values.get(key) ?? fallback,
    set: async (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

test('published notification is unread and pops only once per user', async () => {
  const service = createNotificationService(createMemoryStore());
  const draft = await service.create({
    title: '模型升级完成',
    content: '现在可以正常使用。',
    kind: 'update',
    popupOnFirstView: true,
  }, 'admin');

  assert.equal((await service.listForUser('user-1')).notifications.length, 0);
  await service.setStatus(draft.id, 'published');

  const first = await service.listForUser('user-1');
  assert.equal(first.unreadCount, 1);
  assert.equal(first.popup?.id, draft.id);

  await service.mark('user-1', draft.id, 'popupShownIds');
  const afterPopup = await service.listForUser('user-1');
  assert.equal(afterPopup.popup, null);
  assert.equal(afterPopup.unreadCount, 1);

  await service.mark('user-1', draft.id, 'readIds');
  assert.equal((await service.listForUser('user-1')).unreadCount, 0);

  const otherUser = await service.listForUser('user-2');
  assert.equal(otherUser.popup?.id, draft.id);
  assert.equal(otherUser.unreadCount, 1);
});

test('archived notifications are not shown', async () => {
  const service = createNotificationService(createMemoryStore());
  const archived = await service.create({ title: '维护', content: '维护结束' }, 'admin');
  await service.setStatus(archived.id, 'published');
  await service.setStatus(archived.id, 'archived');

  assert.deepEqual((await service.listForUser('user-1')).notifications, []);
});
