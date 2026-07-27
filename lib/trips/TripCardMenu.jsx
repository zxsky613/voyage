import React, { useEffect, useRef, useState } from "react";
import { MoreVertical, Pencil, Share2, Trash2 } from "lucide-react";
import { useI18n } from "../../i18n/I18nContext.jsx";

/**
 * Menu actions voyage (partager / modifier / supprimer).
 * @param {{ trip: object, onShare?: (trip: object) => void, onEdit?: (trip: object) => void, onDelete?: (trip: object) => void, className?: string }} props
 */
export default function TripCardMenu({ trip, onShare, onEdit, onDelete, className = "" }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [open]);

  const items = [
    onShare ? { key: "share", label: t("tripCard.share"), icon: Share2, onClick: () => onShare(trip) } : null,
    onEdit ? { key: "edit", label: t("tripCard.edit"), icon: Pencil, onClick: () => onEdit(trip) } : null,
    onDelete
      ? { key: "delete", label: t("tripCard.delete"), icon: Trash2, onClick: () => onDelete(trip), danger: true }
      : null,
  ].filter(Boolean);

  if (!items.length) return null;

  return (
    <div ref={rootRef} className={`relative shrink-0 ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
        aria-label={t("common.moreActions") || "Actions"}
        aria-expanded={open}
      >
        <MoreVertical size={16} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 min-w-[9.5rem] overflow-hidden rounded-xl border border-slate-200/90 bg-white py-1 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          {items.map(({ key, label, icon: Icon, onClick, danger }) => (
            <button
              key={key}
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onClick();
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-slate-50 ${
                danger ? "text-rose-700" : "text-slate-700"
              }`}
            >
              <Icon size={14} className="shrink-0 opacity-80" />
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
