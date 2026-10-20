import sections from './sections-data.js?v=59';

export { sections };

export function sectionHref(index) {
  const section = sections[index];
  return section.page ? './' + section.page + '?v=59' : './#' + section.id;
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function icons() {
  window.lucide.createIcons({ attrs: { width: 20, height: 20, 'stroke-width': 1.6, 'aria-hidden': 'true' } });
}

function iconButton(icon, label, className = '') {
  const button = node('button', className);
  button.type = 'button';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.innerHTML = '<i data-lucide="' + icon + '"></i>';
  return button;
}

export function createSectionReader({ onSelect, onClose, standalone = false, mount = document.body }) {
  const element = node('section', 'portal-focus');
  element.setAttribute('aria-label', '帐篷内容');
  const back = iconButton('arrow-left', '返回帐篷', 'focus-back');
  back.addEventListener('click', onClose);
  const copy = node('div', 'focus-copy');
  const heading = node('header', 'chapter-heading');
  const titles = node('div', 'chapter-titles');
  const title = node('h1');
  title.id = standalone ? 'image-page-title' : 'chapter-title';
  const name = node('p', 'chief-name');
  const description = node('p', 'section-description');
  titles.append(title, name, description);
  const scroll = node('div', 'chapter-body');
  scroll.id = standalone ? 'image-page-body' : 'chapter-body';
  scroll.tabIndex = 0;
  scroll.setAttribute('aria-labelledby', title.id);
  const body = node('div', 'chapter-content');
  scroll.append(body);
  const navigation = node('nav', 'section-links');
  navigation.setAttribute('aria-label', '六个板块');
  sections.forEach((section, index) => {
    const link = node('a', '', section.title);
    link.href = sectionHref(index);
    link.dataset.sectionIndex = String(index);
    navigation.append(link);
  });
  heading.append(navigation, titles);
  copy.append(heading, scroll);
  element.append(back, copy);
  mount.append(element);

  const dialog = node('dialog', 'image-viewer');
  dialog.setAttribute('aria-label', '图片查看');
  const toolbar = node('div', 'image-toolbar');
  const previous = iconButton('chevron-left', '上一张');
  const next = iconButton('chevron-right', '下一张');
  const count = node('span', 'image-count');
  const zoom = iconButton('zoom-in', '原尺寸查看');
  zoom.setAttribute('aria-pressed', 'false');
  const download = node('a', 'image-download');
  download.title = '下载图片';
  download.setAttribute('aria-label', '下载图片');
  download.setAttribute('download', '');
  download.innerHTML = '<i data-lucide="download"></i>';
  const dismiss = iconButton('x', '关闭图片');
  toolbar.append(previous, count, next, zoom, download, dismiss);
  const imageStage = node('div', 'image-stage');
  const fullImage = node('img');
  imageStage.append(fullImage);
  dialog.append(toolbar, imageStage);
  document.body.append(dialog);
  let images = [];
  let imageIndex = 0;
  let imageTrigger = null;

  function resetZoom() {
    dialog.classList.remove('zoomed');
    zoom.setAttribute('aria-pressed', 'false');
    zoom.title = '原尺寸查看';
    zoom.setAttribute('aria-label', zoom.title);
    zoom.innerHTML = '<i data-lucide="zoom-in"></i>';
    imageStage.scrollTo(0, 0);
  }

  function showImage(index) {
    imageIndex = (index + images.length) % images.length;
    const image = images[imageIndex];
    fullImage.src = image.src;
    fullImage.alt = image.alt;
    download.href = image.src;
    count.textContent = (imageIndex + 1) + ' / ' + images.length;
    previous.disabled = next.disabled = images.length <= 1;
    resetZoom();
    if (!dialog.open) dialog.showModal();
    icons();
  }

  previous.addEventListener('click', () => showImage(imageIndex - 1));
  next.addEventListener('click', () => showImage(imageIndex + 1));
  dismiss.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => imageTrigger?.focus({ preventScroll: true }));
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); showImage(imageIndex - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); showImage(imageIndex + 1); }
  });
  zoom.addEventListener('click', () => {
    const zoomed = dialog.classList.toggle('zoomed');
    zoom.setAttribute('aria-pressed', String(zoomed));
    zoom.title = zoomed ? '适应画面' : '原尺寸查看';
    zoom.setAttribute('aria-label', zoom.title);
    zoom.innerHTML = '<i data-lucide="' + (zoomed ? 'zoom-out' : 'zoom-in') + '"></i>';
    icons();
  });

  document.addEventListener('click', event => {
    const link = event.target.closest('a[data-section-index]');
    if (!link || event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const index = Number(link.dataset.sectionIndex);
    if (!onSelect) return;
    event.preventDefault();
    onSelect(index);
  });

  function paragraphs(parent, values = []) {
    values.forEach(text => parent.append(node('p', '', text)));
  }

  function show(index) {
    const section = sections[index];
    title.textContent = section.title;
    name.textContent = section.name || '';
    name.hidden = !section.name;
    description.textContent = standalone ? section.description || '' : '';
    description.hidden = !description.textContent;
    body.replaceChildren();
    scroll.scrollTop = 0;
    body.classList.toggle('image-content', Boolean(section.images));
    body.classList.toggle('profile-content', section.id === 'chief');
    const textLength = [...(section.tags || []), ...(section.paragraphs || []),
      ...(section.groups || []).flatMap(group => [group.title, ...group.paragraphs])].join('').length;
    body.classList.toggle('short-content', !section.images && !section.rules && !section.articles && textLength <= 180);
    document.querySelectorAll('[data-section-index]').forEach(link => {
      if (Number(link.dataset.sectionIndex) === index) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    if (section.tags) {
      const tags = node('ul', 'profile-tags');
      section.tags.forEach(text => tags.append(node('li', '', text)));
      body.append(tags);
    }
    paragraphs(body, section.paragraphs);
    (section.groups || []).forEach(group => {
      const block = node('section', 'content-group');
      block.append(node('h2', '', group.title));
      paragraphs(block, group.paragraphs);
      body.append(block);
    });
    if (section.rules) {
      const rules = node('ol', 'chapter-rules');
      section.rules.forEach(rule => {
        const item = node('li');
        item.append(node('h2', '', rule.title), node('p', 'rule-voice', rule.text));
        rules.append(item);
      });
      body.append(rules);
    }
    (section.quotes || []).forEach(text => body.append(node('blockquote', 'chapter-quote', text)));
    (section.articles || []).forEach((article) => {
      const details = node('details', 'whisper-article');
      details.open = true;
      const summary = node('summary');
      summary.append(node('span', '', article.title));
      const arrow = node('i');
      arrow.dataset.lucide = 'chevron-down';
      summary.append(arrow);
      const text = node('div', 'whisper-text');
      paragraphs(text, article.paragraphs);
      details.append(summary, text);
      body.append(details);
    });
    images = section.images || [];
    if (images.length) {
      const gallery = node('div', 'chapter-gallery' + (images.length === 1 ? ' single-image' : ''));
      const buttons = [];
      images.forEach((image, i) => {
        const button = node('button', 'gallery-image');
        button.type = 'button';
        button.title = '放大' + image.caption;
        button.setAttribute('aria-label', button.title);
        const picture = node('img');
        picture.src = image.src;
        picture.alt = image.alt;
        picture.loading = 'lazy';
        picture.decoding = 'async';
        button.append(picture);
        button.addEventListener('click', () => { imageTrigger = button; showImage(i); });
        gallery.append(button);
        buttons.push(button);
      });
      body.append(gallery);
      if (images.length > 3 && !standalone) {
        const pages = Math.ceil(images.length / 3);
        let page = 0;
        const pager = node('nav', 'gallery-pages');
        pager.setAttribute('aria-label', '卡面分页');
        const prevPage = iconButton('chevron-left', '上一组卡面');
        const nextPage = iconButton('chevron-right', '下一组卡面');
        const dots = node('div', 'gallery-dots');
        const selectors = Array.from({ length: pages }, (_, index) => {
          const dot = node('button', 'gallery-dot');
          dot.type = 'button';
          dot.title = '第' + (index + 1) + '组卡面';
          dot.setAttribute('aria-label', dot.title);
          dot.addEventListener('click', () => changePage(index));
          dots.append(dot);
          return dot;
        });
        function changePage(index) {
          page = index;
          buttons.forEach((button, i) => { button.hidden = Math.floor(i / 3) !== page; });
          selectors.forEach((dot, i) => dot.setAttribute('aria-pressed', String(i === page)));
          prevPage.disabled = page === 0;
          nextPage.disabled = page === pages - 1;
        }
        prevPage.addEventListener('click', () => changePage(page - 1));
        nextPage.addEventListener('click', () => changePage(page + 1));
        pager.append(prevPage, dots, nextPage);
        body.append(pager);
        changePage(0);
      }
    }
    icons();
  }

  icons();
  return { element, show, isImageOpen: () => dialog.open, closeImage: () => dialog.close(), focusBack: () => back.focus({ preventScroll: true }) };
}
