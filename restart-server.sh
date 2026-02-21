#!/bin/bash

# Script para reiniciar el servidor del backend
# Uso: ./restart-server.sh

echo "🔄 Deteniendo procesos en el puerto 4000..."
lsof -ti:4000 | xargs kill -9 2>/dev/null || echo "✓ Puerto 4000 libre"

echo "🔄 Deteniendo nodemon..."
pkill -9 nodemon 2>/dev/null || echo "✓ No hay procesos nodemon"

echo "⏳ Esperando 1 segundo..."
sleep 1

echo "🚀 Iniciando servidor..."
npm run dev
