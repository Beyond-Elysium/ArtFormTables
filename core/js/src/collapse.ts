import { Collapse } from 'bootstrap'

/*
Core collapse
 */
const collapseTriggerList: HTMLElement[] = [].slice.call(document.querySelectorAll<HTMLElement>('[data-bs-toggle="collapse"]'))
collapseTriggerList.map(function (collapseTriggerEl: HTMLElement) {
  const target = collapseTriggerEl.getAttribute('data-bs-target') || collapseTriggerEl.getAttribute('href')
  if (target === null) {
    return
  }

  const collapseEl = document.querySelector<HTMLElement>(target)
  if (collapseEl === null) {
    return
  }

  const collapse = new Collapse(collapseEl, {
    toggle: false,
  })

  collapseTriggerEl.addEventListener('click', (e) => {
    e.preventDefault()
    collapse.toggle()
  })
})
