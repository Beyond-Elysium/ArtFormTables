import { Offcanvas } from 'bootstrap'

/*
Core offcanvas
 */
const offcanvasTriggerList: HTMLElement[] = [].slice.call(document.querySelectorAll<HTMLElement>('[data-bs-toggle="offcanvas"]'))
offcanvasTriggerList.map(function (offcanvasTriggerEl: HTMLElement) {
  const target = offcanvasTriggerEl.getAttribute('data-bs-target') || offcanvasTriggerEl.getAttribute('href')
  if (target === null) {
    return
  }

  const offcanvasEl = document.querySelector<HTMLElement>(target)
  if (offcanvasEl === null) {
    return
  }

  const offcanvas = new Offcanvas(offcanvasEl)

  offcanvasTriggerEl.addEventListener('click', (e) => {
    e.preventDefault()
    offcanvas.show()
  })
})
