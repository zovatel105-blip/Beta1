'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '../lib/utils';

const CircularCrop = ({ isOpen, onClose, onImageCropped, initialImage = null }) => {
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const [image, setImage] = useState(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });
  const [lastTouchDistance, setLastTouchDistance] = useState(0);
  const [loading, setLoading] = useState(false);

  // Configuración del crop circular
  const CANVAS_SIZE = 330;
  const CROP_SIZE = 330;
  const MAX_SCALE = 4;

  // Calcular escala mínima que cubre todo el círculo
  const getMinCoverScale = (img) => {
    if (!img) return 0.3;
    return Math.max(CANVAS_SIZE / img.width, CANVAS_SIZE / img.height);
  };

  // Restringir posición para que la imagen siempre cubra el círculo
  const clampPosition = (pos, img, currentScale) => {
    if (!img) return pos;
    const scaledW = img.width * currentScale;
    const scaledH = img.height * currentScale;
    const radius = CANVAS_SIZE / 2;
    const maxOffsetX = Math.max(0, (scaledW / 2) - radius);
    const maxOffsetY = Math.max(0, (scaledH / 2) - radius);
    return {
      x: Math.max(-maxOffsetX, Math.min(maxOffsetX, pos.x)),
      y: Math.max(-maxOffsetY, Math.min(maxOffsetY, pos.y))
    };
  };

  useEffect(() => {
    if (initialImage) {
      handleImageLoad(initialImage);
    }
  }, [initialImage, isOpen]);

  const handleImageLoad = (imageSrc) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setImage(img);
      // Escala inicial para cubrir todo el círculo (object-cover)
      const initialScale = Math.max(CANVAS_SIZE / img.width, CANVAS_SIZE / img.height);

      // Asegurar que la escala permita ver la imagen completa
      const finalScale = Math.max(initialScale, getMinCoverScale(img));
      setScale(finalScale);
      setPosition({ x: 0, y: 0 });
      drawCanvas(img, finalScale, { x: 0, y: 0 });
    };
    img.src = imageSrc;
  };

  const drawCanvas = useCallback((img = image, currentScale = scale, currentPosition = position) => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');

    // Configurar alta resolución para evitar difuminación
    const devicePixelRatio = window.devicePixelRatio || 1;
    const canvasSize = CANVAS_SIZE;
    const displaySize = canvasSize;

    // Configurar tamaño real del canvas para alta resolución
    canvas.width = canvasSize * devicePixelRatio;
    canvas.height = canvasSize * devicePixelRatio;

    // Configurar tamaño de display
    canvas.style.width = displaySize + 'px';
    canvas.style.height = displaySize + 'px';

    // Escalar el contexto para alta resolución
    ctx.scale(devicePixelRatio, devicePixelRatio);

    // Configurar calidad de renderizado para imágenes nítidas
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Limpiar canvas completamente
    ctx.clearRect(0, 0, canvasSize, canvasSize);

    // Calcular dimensiones de la imagen escalada
    const scaledWidth = img.width * currentScale;
    const scaledHeight = img.height * currentScale;

    // Posición centrada + offset del drag
    const centerX = canvasSize / 2;
    const centerY = canvasSize / 2;
    const imageX = centerX - scaledWidth / 2 + currentPosition.x;
    const imageY = centerY - scaledHeight / 2 + currentPosition.y;

    // Crear clipping path circular que ocupa todo el canvas
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, canvasSize / 2, 0, 2 * Math.PI);
    ctx.clip();

    // Dibujar imagen con alta calidad dentro del círculo
    ctx.drawImage(img, imageX, imageY, scaledWidth, scaledHeight);

    ctx.restore();

    // Dibujar borde del círculo con estilo claro
    ctx.strokeStyle = 'rgba(229, 231, 235, 0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(centerX, centerY, canvasSize / 2 - 1.5, 0, 2 * Math.PI);
    ctx.stroke();
  }, [image, scale, position]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // Funciones de zoom
  const handleZoomIn = () => {
    const newScale = Math.min(scale * 1.2, MAX_SCALE);
    setScale(newScale);
    drawCanvas(image, newScale, position);
  };

  const handleZoomOut = () => {
    const minScale = getMinCoverScale(image);
    const newScale = Math.max(scale * 0.8, minScale);
    const newPos = clampPosition(position, image, newScale);
    setScale(newScale);
    setPosition(newPos);
    drawCanvas(image, newScale, newPos);
  };

  const handleReset = () => {
    if (image) {
      const newScale = getMinCoverScale(image);
      const newPosition = { x: 0, y: 0 };
      setScale(newScale);
      setPosition(newPosition);
      drawCanvas(image, newScale, newPosition);
    }
  };

  // Funciones de drag (mouse)
  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setLastPanPoint(position);
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;

    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;
    const newPosition = clampPosition({
      x: lastPanPoint.x + deltaX,
      y: lastPanPoint.y + deltaY
    }, image, scale);

    setPosition(newPosition);
    drawCanvas(image, scale, newPosition);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Funciones táctiles
  const getTouchDistance = (touches) => {
    if (touches.length < 2) return 0;
    const touch1 = touches[0];
    const touch2 = touches[1];
    return Math.sqrt(
      Math.pow(touch2.clientX - touch1.clientX, 2) +
      Math.pow(touch2.clientY - touch1.clientY, 2)
    );
  };

  const handleTouchStart = (e) => {
    e.preventDefault();
    const touches = e.touches;

    if (touches.length === 1) {
      // Drag con un dedo
      setIsDragging(true);
      setDragStart({ x: touches[0].clientX, y: touches[0].clientY });
      setLastPanPoint(position);
    } else if (touches.length === 2) {
      // Zoom con dos dedos
      setIsDragging(false);
      const distance = getTouchDistance(touches);
      setLastTouchDistance(distance);
    }
  };

  const handleTouchMove = (e) => {
    e.preventDefault();
    const touches = e.touches;

    if (touches.length === 1 && isDragging) {
      // Drag con un dedo
      const deltaX = touches[0].clientX - dragStart.x;
      const deltaY = touches[0].clientY - dragStart.y;
      const newPosition = clampPosition({
        x: lastPanPoint.x + deltaX,
        y: lastPanPoint.y + deltaY
      }, image, scale);

      setPosition(newPosition);
      drawCanvas(image, scale, newPosition);
    } else if (touches.length === 2) {
      // Zoom con dos dedos
      const distance = getTouchDistance(touches);
      if (lastTouchDistance > 0) {
        const minScale = getMinCoverScale(image);
        const scaleChange = distance / lastTouchDistance;
        const newScale = Math.max(minScale, Math.min(MAX_SCALE, scale * scaleChange));
        const newPos = clampPosition(position, image, newScale);
        setScale(newScale);
        setPosition(newPos);
        drawCanvas(image, newScale, newPos);
      }
      setLastTouchDistance(distance);
    }
  };

  const handleTouchEnd = (e) => {
    e.preventDefault();
    setIsDragging(false);
    setLastTouchDistance(0);
  };

  // Función para recortar imagen
  const handleCropImage = () => {
    if (!image) return;

    setLoading(true);

    // Crear canvas temporal para el crop circular con alta resolución
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    // Usar alta resolución para el crop final (2x para mejor calidad)
    const outputSize = CANVAS_SIZE * 2; // Doble resolución para mejor calidad
    tempCanvas.width = outputSize;
    tempCanvas.height = outputSize;

    // Configurar alta calidad de renderizado
    tempCtx.imageSmoothingEnabled = true;
    tempCtx.imageSmoothingQuality = 'high';

    // Calcular dimensiones de la imagen escalada para alta resolución
    const resolutionMultiplier = 2; // 2x para mejor calidad
    const scaledWidth = image.width * scale * resolutionMultiplier;
    const scaledHeight = image.height * scale * resolutionMultiplier;

    // Posición de la imagen ajustada para alta resolución
    const centerX = outputSize / 2;
    const centerY = outputSize / 2;
    const imageX = centerX - scaledWidth / 2 + (position.x * resolutionMultiplier);
    const imageY = centerY - scaledHeight / 2 + (position.y * resolutionMultiplier);

    // Crear círculo clip que ocupa todo el canvas de alta resolución
    tempCtx.beginPath();
    tempCtx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, 2 * Math.PI);
    tempCtx.clip();

    // Dibujar la imagen completa escalada y posicionada con alta calidad
    tempCtx.drawImage(image, imageX, imageY, scaledWidth, scaledHeight);

    // Convertir a blob con máxima calidad y llamar callback
    tempCanvas.toBlob((blob) => {
      const croppedImageUrl = URL.createObjectURL(blob);
      onImageCropped(croppedImageUrl, blob);
      setLoading(false);
      onClose();
    }, 'image/jpeg', 0.98); // JPEG con 98% de calidad para mejor balance calidad/tamaño
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        handleImageLoad(e.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={cn(
      "fixed inset-0 bg-white z-[95] flex flex-col",
      !isOpen && "hidden"
    )}>

      {/* Header - Solo título centrado */}
      <div className="flex items-center justify-center py-6"
           style={{ paddingTop: 'max(env(safe-area-inset-top), 24px)' }}>
        <h1 className="text-2xl font-semibold text-black">Crop</h1>
      </div>

      {/* Body - Imagen centrada con máscara circular */}
      <div className="flex-1 flex items-center justify-center bg-white">
        {!image ? (
          <div className="text-center">
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="bg-gray-50 hover:bg-gray-100 px-8 py-12 rounded-2xl border-2 border-dashed border-gray-300 hover:border-gray-400 transition-all duration-200">
                <Upload className="w-16 h-16 text-gray-400 mx-auto mb-6" />
                <p className="text-gray-900 text-xl font-medium mb-2">Selecciona una foto</p>
                <p className="text-gray-500 text-sm">JPG, PNG o GIF hasta 10MB</p>
              </div>
            </label>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-6">
            {/* Canvas con diseño igual a la referencia */}
            <canvas
              ref={canvasRef}
              width={CANVAS_SIZE}
              height={CANVAS_SIZE}
              className="cursor-move touch-none rounded-full"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            />
          </div>
        )}
      </div>

      {/* Footer - Botones Cancel y Save (pastilla, blanco y negro) */}
      {image && (
        <div className="px-6 py-6 bg-white" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}>
          <div className="flex items-center justify-center space-x-4">
            {/* Botón Cancel - pastilla BLANCA con borde/texto negro */}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-white hover:bg-zinc-50 text-black font-semibold py-4 rounded-full border-2 border-black transition-all duration-200 max-w-[150px] active:scale-95"
            >
              Cancel
            </button>

            {/* Botón Save - pastilla NEGRA sólida con texto blanco */}
            <button
              type="button"
              onClick={handleCropImage}
              disabled={loading}
              className="flex-1 bg-black hover:bg-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-full transition-all duration-200 max-w-[150px] active:scale-95"
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CircularCrop;
