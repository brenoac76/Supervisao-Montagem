
import React, { useEffect } from 'react';

interface ModalProps {
  onClose: () => void;
  children: React.ReactNode;
  fullScreen?: boolean; // New prop for media viewer
}

const Modal: React.FC<ModalProps> = ({ onClose, children, fullScreen = false }) => {
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  if (fullScreen) {
    return (
      <div
        className="fixed inset-0 bg-black z-50 flex justify-center items-center overflow-hidden"
        onClick={onClose}
      >
        <div
          className="relative w-full h-full flex items-center justify-center"
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/70 hover:text-white bg-black/50 rounded-full w-10 h-10 flex items-center justify-center text-2xl z-50 backdrop-blur-sm"
            aria-label="Fechar"
          >
            &times;
          </button>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white p-5 rounded-lg shadow-2xl relative max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 bg-slate-700 text-white rounded-full w-8 h-8 flex items-center justify-center text-xl font-bold hover:bg-red-600 transition-colors"
          aria-label="Fechar modal"
        >
          &times;
        </button>
        {children}
      </div>
    </div>
  );
};

export default Modal;
