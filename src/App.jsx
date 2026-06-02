import { BrowserRouter, Routes, Route } from 'react-router-dom'
import SlideshowPage from './pages/SlideshowPage'
import EEGPage from './pages/EEGPage'
import SummaryPage from './pages/SummaryPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SlideshowPage />} />
        <Route path="/data" element={<EEGPage />} />
        <Route path="/summary" element={<SummaryPage />} />
      </Routes>
    </BrowserRouter>
  )
}
