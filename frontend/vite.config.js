import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy API calls during development to the backend running on port 8000
    proxy: {
      // forward any request starting with /stage3 to backend
      '/stage3': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
      // artifacts (static files served by backend)
      '/artifacts': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})

