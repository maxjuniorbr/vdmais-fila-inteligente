import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PlaygroundPage } from './PlaygroundPage'

// Página só de dev (rota /playground, galeria de componentes) — excluída da cobertura
// no vite.config. Um smoke test basta para garantir que não quebra; o comportamento de
// cada componente é coberto pelos specs dedicados (Modal/Drawer/Toast/Accordion/...).
describe('PlaygroundPage', () => {
  it('renders without crashing', () => {
    render(<PlaygroundPage />)
    expect(screen.getByRole('heading', { name: 'Design Playground' })).toBeInTheDocument()
  })
})
