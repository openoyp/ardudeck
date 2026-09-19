import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, ShieldAlert, FileDown, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { useSigningStore } from '../../stores/signing-store';
import type { SigningAuditEntry, SigningAuditEvent, ChainVerification } from '../../../shared/signing-audit-types';

const EVENT_LABELS: Record<SigningAuditEvent, string> = {
  'key-set': '已设置密钥',
  'key-sent-to-fc': '密钥已发送到 FC',
  'signing-enabled': '签名已启用',
  'signing-disabled': '签名已禁用',
  'key-auto-matched': '连接时自动匹配',
  'key-mismatch': '密钥不匹配',
  'key-removed': '密钥已移除',
  'startup-auto-enable': '启动时自动启用',
};

const EVENT_TONE: Record<SigningAuditEvent, string> = {
  'key-set': 'text-content',
  'key-sent-to-fc': 'text-emerald-400',
  'signing-enabled': 'text-emerald-400',
  'signing-disabled': 'text-amber-400',
  'key-auto-matched': 'text-emerald-400',
  'key-mismatch': 'text-red-400',
  'key-removed': 'text-amber-400',
  'startup-auto-enable': 'text-emerald-400',
};

/**
 * Secure-link compliance surface: a tamper-evident audit log of every signing
 * state change, with hash-chain verification, and a one-click evidence pack
 * (JSON + Markdown posture report) a buyer can hand to a procurement reviewer.
 *
 * This is the deliverable that turns the signing tooling we already ship into a
 * procurement artifact. The copy is explicit that we attest the LINK and the
 * ground station, never the airframe.
 */
export function SecureLinkCompliance() {
  // Re-fetch whenever live signing state changes so the log stays current.
  const signingSignature = useSigningStore((s) => `${s.enabled}/${s.sentToFc}/${s.keyMismatch}/${s.keyFingerprint ?? ''}`);

  const [entries, setEntries] = useState<SigningAuditEntry[]>([]);
  const [chain, setChain] = useState<ChainVerification | null>(null);
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const snap = await window.electronAPI?.signingAuditGet?.();
    if (!snap) return;
    setEntries(snap.entries);
    setChain(snap.chain);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, signingSignature]);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(t);
  }, [message]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await window.electronAPI?.signingExportEvidence?.();
      if (res?.success) setMessage('证据包与安全态势报告已导出');
      else if (res && res.error !== 'Cancelled') setMessage(`导出失败：${res.error}`);
    } finally {
      setExporting(false);
    }
  };

  const chainOk = chain?.ok ?? true;
  const recent = [...entries].reverse(); // newest first

  return (
    <div className="rounded-lg border border-subtle bg-surface p-3 space-y-3">
      <div className="flex items-center gap-2.5">
        {chainOk ? (
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
        ) : (
          <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
        )}
        <div className="min-w-0">
          <div className="text-xs font-medium text-content">合规与审计</div>
          <div className="text-[10px] text-content-secondary">
            {chain
              ? chainOk
                ? `已记录 ${chain.count} 条签名事件，哈希链校验通过`
                : `哈希链在第 ${chain.brokenAtSeq} 条断开 — 日志可能被篡改`
              : '签名状态变更的防篡改日志'}
          </div>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-cyan-700/70 hover:bg-cyan-600 disabled:opacity-50 text-white text-[11px] rounded-lg transition-colors shrink-0"
          title="导出安全链路证据包（JSON）与安全态势报告（Markdown），供采购审查使用"
        >
          <FileDown className="w-3.5 h-3.5" />
          {exporting ? '正在导出...' : '导出证据'}
        </button>
      </div>

      {!chainOk && (
        <div className="rounded-md border border-red-500/20 bg-red-500/5 px-2.5 py-2">
          <p className="text-[11px] text-red-400">
            审计日志未通过哈希链校验。有条目在应用外被编辑、插入或删除。
            请将该日志视为已泄露并导出以供审查。
          </p>
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] text-content-secondary hover:text-content transition-colors"
        >
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          {open ? '隐藏' : '查看'}审计日志（{entries.length}）
          <RefreshCw
            className="w-3 h-3 ml-1 hover:text-content"
            onClick={(e) => { e.stopPropagation(); void refresh(); }}
          />
        </button>

        {open && (
          <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-subtle divide-y divide-subtle">
            {recent.length === 0 ? (
              <div className="px-3 py-4 text-center text-[11px] text-content-tertiary">
                尚未记录任何签名事件。
              </div>
            ) : (
              recent.map((e) => (
                <div key={e.id} className="px-2.5 py-1.5 flex items-center gap-2 text-[10px]">
                  <span className="font-mono text-content-tertiary shrink-0">#{e.seq}</span>
                  <span className={`font-medium shrink-0 ${EVENT_TONE[e.event]}`}>{EVENT_LABELS[e.event]}</span>
                  {e.fingerprint && (
                    <span className="font-mono text-content-tertiary truncate" title={e.fingerprint}>
                      {e.fingerprint.slice(0, 8)}
                    </span>
                  )}
                  <span className="text-content-secondary truncate flex-1" title={e.detail}>{e.detail}</span>
                  <span className="text-content-tertiary shrink-0 tabular-nums" title={e.isoTime}>
                    {new Date(e.ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <p className="text-[10px] text-content-tertiary leading-snug">
        仅证明 MAVLink 链路与地面站，不涉及机体本身。签名是身份认证而非加密，USB 连接可绕过签名。
      </p>

      {message && (
        <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5">
          <p className="text-[11px] text-emerald-400">{message}</p>
        </div>
      )}
    </div>
  );
}
