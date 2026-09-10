/**
 * Keys page — admin view + create/revoke agent API keys.
 *
 * The plaintext key is shown ONCE on creation. After the page reloads it
 * is gone forever — the server only stores the bcrypt hash.
 */

import { listKeys } from "@/lib/api.server";
import { KeysManager } from "@/components/KeysManager";

export const revalidate = 0; // always fresh
export const dynamic = "force-dynamic";

export default async function KeysPage() {
  const keys = await listKeys().catch(() => ({ keys: [] }));
  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold tracking-tight text-ink-100">
          Agent API keys
        </h2>
        <p className="mt-1 text-sm text-ink-400">
          Each OpenClaw bot gets its own bearer token. The plaintext is
          shown <strong>once</strong> on creation — the API only stores
          bcrypt hashes.
        </p>
      </header>
      <KeysManager initialKeys={keys.keys} />
    </div>
  );
}