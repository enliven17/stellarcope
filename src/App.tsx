import { Route, Routes } from 'react-router-dom'
import { useSmoothScroll } from './lib/smooth'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import Pilot from './pages/Pilot'
import Operator from './pages/Operator'
import PublicCard from './pages/PublicCard'
import Docs from './pages/Docs'
import NotFound from './pages/NotFound'
import CommandPalette from './components/CommandPalette'

export default function App() {
  useSmoothScroll()
  return (
    <>
      <CommandPalette />
      <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/demo" element={<Dashboard />} />
      <Route path="/pilot" element={<Pilot />} />
      <Route path="/operator" element={<Operator />} />
      <Route path="/p/:slug" element={<PublicCard />} />
        <Route path="/docs" element={<Docs />} />
        <Route path="/docs/:page" element={<Docs />} />
      <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  )
}
