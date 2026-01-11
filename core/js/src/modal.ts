import { Modal } from 'bootstrap'

/*
Core modals
 */
const modalTriggerList: HTMLElement[] = [].slice.call(document.querySelectorAll<HTMLElement>('[data-bs-toggle="modal"]'))
modalTriggerList.map(function (modalTriggerEl: HTMLElement) {
  const target = modalTriggerEl.getAttribute('data-bs-target') || modalTriggerEl.getAttribute('href')
  if (target === null) {
    return
  }

  const modalEl = document.querySelector<HTMLElement>(target)
  if (modalEl === null) {
    return
  }

  const modal = new Modal(modalEl)

  modalTriggerEl.addEventListener('click', (e) => {
    e.preventDefault()
    modal.show()
  })
})
