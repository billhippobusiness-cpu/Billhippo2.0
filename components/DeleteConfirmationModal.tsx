import React from 'react';
import { Trash2 } from 'lucide-react';

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  isDeleting?: boolean;
}

const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  onCancel,
  onConfirm,
  isDeleting = false,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-modal-backdrop"
        onClick={!isDeleting ? onCancel : undefined}
      />

      {/* Modal card */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-modal-slide-up overflow-hidden">
        {/* Red accent bar */}
        <div className="h-1 bg-gradient-to-r from-red-400 via-rose-500 to-red-600" />

        <div className="p-6 pt-5">
          {/* Icon */}
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-red-50 border-4 border-red-100 mx-auto mb-4">
            <Trash2 className="w-7 h-7 text-red-500" />
          </div>

          {/* Title */}
          <h3 className="text-center text-lg font-bold text-gray-900 mb-2">{title}</h3>

          {/* Message */}
          <p className="text-center text-sm text-gray-500 leading-relaxed">{message}</p>

          {/* Action buttons */}
          <div className="flex gap-3 mt-6">
            <button
              onClick={onCancel}
              disabled={isDeleting}
              className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all disabled:opacity-50"
            >
              No, Keep It
            </button>
            <button
              onClick={onConfirm}
              disabled={isDeleting}
              className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 active:bg-red-700 rounded-xl transition-all disabled:opacity-70 flex items-center justify-center gap-2 shadow-lg shadow-red-200"
            >
              {isDeleting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Deleting…
                </>
              ) : (
                'Yes, Delete'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmationModal;
