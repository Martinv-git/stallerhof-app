import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/stallerhof-app/',              // ⬅️ wichtig für GitHub Pages
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Stallerhof App',
        short_name: 'Stallerhof',
        description: 'Kategorien, Checklisten, Kalender & Notizen',
        theme_color: '#3aa17e',
        background_color: '#0b0c10',
        display: 'standalone',
        scope: './',
        start_url: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      }
    })
  ]
})
