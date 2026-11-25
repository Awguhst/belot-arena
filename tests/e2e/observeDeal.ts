/** Keep a receipt from the native Web Animations call while the cards still exist. */
export function observeDeal() {
  const animate = Element.prototype.animate
  const cards = new Set<string>()
  Element.prototype.animate = function (...args) {
    const animation = animate.apply(this, args)
    const id = this.getAttribute('data-flight')
    const effect = animation.effect
    if (id?.startsWith('deal-') && effect instanceof KeyframeEffect && effect.target === this) {
      const positions = new Set(effect.getKeyframes().map((frame) => frame.transform))
      if (positions.size > 1 && Number(effect.getTiming().duration) > 0) {
        cards.add(id)
        const layer = this.closest('[data-animation-layer]')!
        const receipt = {
          stage: layer.getAttribute('data-choreography'),
          cards: layer.querySelectorAll('[data-flight]').length,
          faces: layer.querySelectorAll('.flight-face').length,
          backs: layer.querySelectorAll('.flight-reverse').length,
          animated: cards.size,
        }
        document.documentElement.dataset.observedDeal = JSON.stringify(receipt)
      }
    }
    return animation
  }
}
