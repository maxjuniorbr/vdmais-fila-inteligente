export function abbreviateName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]

  const particles = new Set(['da', 'das', 'de', 'do', 'dos', 'e'])
  const surname = parts.slice(1).find((part) => !particles.has(part.toLocaleLowerCase('pt-BR')))
  return surname ? `${parts[0]} ${surname[0]}.` : parts[0]
}
