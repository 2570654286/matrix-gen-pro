import { useRef } from 'react';

/**
 * Hook to handle modal click-outside behavior that distinguishes between
 * clicks and drags. Prevents closing modal when user drags from inside
 * the modal to outside.
 * 
 * @param onClose Callback to close the modal
 * @param modalContentSelector Selector for the modal content element (default: '[data-modal-content]')
 * @returns Event handlers to attach to the backdrop element
 */
export function useModalClickOutside(
  onClose: () => void,
  modalContentSelector: string = '[data-modal-content]'
) {
  const interactionRef = useRef<{
    mouseDownInsideModal: boolean;
    hasDragged: boolean;
    mouseDownX: number;
    mouseDownY: number;
  }>({
    mouseDownInsideModal: false,
    hasDragged: false,
    mouseDownX: 0,
    mouseDownY: 0,
  });

  const handleMouseDown = (e: React.MouseEvent<HTMLElement>) => {
    const currentTarget = e.currentTarget as HTMLElement;
    const modalContent = currentTarget.querySelector(modalContentSelector) as HTMLElement;
    const target = e.target as HTMLElement;
    const isInsideModal = modalContent && (modalContent.contains(target) || modalContent === target);

    interactionRef.current = {
      mouseDownInsideModal: isInsideModal,
      hasDragged: false,
      mouseDownX: e.clientX,
      mouseDownY: e.clientY,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const { mouseDownX, mouseDownY } = interactionRef.current;
    if (mouseDownX !== 0 || mouseDownY !== 0) {
      const deltaX = Math.abs(e.clientX - mouseDownX);
      const deltaY = Math.abs(e.clientY - mouseDownY);
      // 如果移动超过 5px，视为拖拽操作
      if (deltaX > 5 || deltaY > 5) {
        interactionRef.current.hasDragged = true;
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLElement>) => {
    const { mouseDownInsideModal, hasDragged } = interactionRef.current;

    // 如果是在模态框内按下，或者发生了拖拽，不关闭模态框
    if (mouseDownInsideModal || hasDragged) {
      // 重置状态
      interactionRef.current = {
        mouseDownInsideModal: false,
        hasDragged: false,
        mouseDownX: 0,
        mouseDownY: 0,
      };
      return;
    }

    // 检查是否点击的是背景层本身（不是子元素）
    const target = e.target as HTMLElement;
    const isClickingBackdrop = target === e.currentTarget;

    if (isClickingBackdrop) {
      onClose();
    }

    // 重置状态
    interactionRef.current = {
      mouseDownInsideModal: false,
      hasDragged: false,
      mouseDownX: 0,
      mouseDownY: 0,
    };
  };

  return {
    onMouseDown: handleMouseDown,
    onMouseMove: handleMouseMove,
    onMouseUp: handleMouseUp,
  };
}
