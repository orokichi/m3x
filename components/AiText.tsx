'use client';
import Link from 'next/link';
/** AI answer text: keeps line breaks, strips markdown emphasis, turns [n] into jump links to #<anchor>-n. */
export function AiText({ text, anchor, hrefOf }: { text: string; anchor?: string; hrefOf?: (n: number) => string | undefined }) {
  const clean = text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#{1,6}\s*/gm, '').replace(/^\s*[*-]\s+/gm, '・').trim();
  const parts = clean.split(/(\[\d+(?:\s*[,、]\s*\d+)*\])/g);
  return (
    <div className="ai-text">{parts.map((p, i) => {
      const m = (anchor || hrefOf) && p.match(/^\[([\d\s,、]+)\]$/);
      if (!m) return <span key={i}>{p}</span>;
      return <span key={i}>{m[1].split(/[,、]/).map((n) => n.trim()).filter(Boolean).map((n) => hrefOf ? (
        hrefOf(+n) ? <Link key={n} className="cite" href={hrefOf(+n)!} title="ポストを開く">{n}</Link> : <span key={n} className="cite">{n}</span>
      ) : (
        <a key={n} className="cite" href={`#${anchor}-${n}`} onClick={(e) => { const el = document.getElementById(`${anchor}-${n}`); if (el) { e.preventDefault(); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); } }}>{n}</a>
      ))}</span>;
    })}</div>
  );
}
