import { describe, it, expect, beforeEach } from 'vitest'
import { hexToRgba, getColor, prefix } from '../../src/tabler'

describe('tabler', () => {
  describe('prefix', () => {
    it('should have correct prefix value', () => {
      expect(prefix).toBe('tblr-')
    })
  })

  describe('hexToRgba', () => {
    it('should convert hex color to rgba string', () => {
      expect(hexToRgba('#ff0000', 1)).toBe('rgba(255, 0, 0, 1)')
      expect(hexToRgba('#00ff00', 0.5)).toBe('rgba(0, 255, 0, 0.5)')
      expect(hexToRgba('#0000ff', 0.8)).toBe('rgba(0, 0, 255, 0.8)')
    })

    it('should handle hex without #', () => {
      expect(hexToRgba('ff0000', 1)).toBe('rgba(255, 0, 0, 1)')
    })

    it('should handle uppercase hex', () => {
      expect(hexToRgba('#FF0000', 1)).toBe('rgba(255, 0, 0, 1)')
    })

    it('should return null for invalid hex', () => {
      expect(hexToRgba('invalid', 1)).toBeNull()
      expect(hexToRgba('#gg0000', 1)).toBeNull()
      expect(hexToRgba('', 1)).toBeNull()
    })
  })

  describe('getColor', () => {
    let originalBody: HTMLBodyElement

    beforeEach(() => {
      // Save original body
      originalBody = document.body
      
      // Set test CSS variable value
      document.body.style.setProperty(`--${prefix}primary`, '#ff0000')
    })

    it('should get color from CSS variable', () => {
      const color = getColor('primary')
      expect(color).toBe('#ff0000')
    })

    it('should return null if color variable does not exist', () => {
      const color = getColor('nonexistent')
      expect(color).toBe('')
    })

    it('should convert to rgba when opacity is provided', () => {
      const color = getColor('primary', 0.5)
      expect(color).toBe('rgba(255, 0, 0, 0.5)')
    })

    it('should return hex color when opacity is 1', () => {
      const color = getColor('primary', 1)
      expect(color).toBe('#ff0000')
    })
  })
})
