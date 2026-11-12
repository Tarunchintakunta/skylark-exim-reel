/**
 * Tarun's Skylark Exim logo (leaping fish, shrimp, container ships, name), cut out of its white background. One 128 px
 * file covers every slot (44 px header and 56 px footer, up to a 2.9x screen). Fixed size, so it never moves the layout;
 * low priority, so it never competes with the headline for the first paint.
 */
export function Mark({ className, size = 44, lazy = false }: { className?: string; size?: number; lazy?: boolean }) {
  return <img className={className} src="/logo-128.webp" width={size} height={size} alt="" decoding="async" fetchPriority="low" loading={lazy ? 'lazy' : undefined} />
}
