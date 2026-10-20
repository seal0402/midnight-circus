import { createSectionReader, sections } from './sections.js?v=60';

const index = sections.findIndex(section => section.id === document.body.dataset.section);
const reader = createSectionReader({
  standalone: true,
  onClose: () => location.assign('./'),
});
reader.show(index);
reader.element.classList.add('active', 'ready');
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && reader.isImageOpen()) {
    event.preventDefault();
    reader.closeImage();
  }
});
