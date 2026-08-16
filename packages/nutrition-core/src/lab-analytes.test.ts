import { describe, expect, it } from 'vitest'
import { LAB_ANALYTE_PRESETS, computeLabAbnormalStatus, findLabAnalytePreset } from './lab-analytes'

describe('LAB_ANALYTE_PRESETS', () => {
  it('roadmap Prompt 4.3, GÖREV 2te sayılan 17 analitin tamamını içerir', () => {
    const expectedCodes = [
      'aclik_glukoz',
      'hba1c',
      'tsh',
      't3',
      't4',
      'total_kolesterol',
      'ldl_kolesterol',
      'hdl_kolesterol',
      'trigliserit',
      'ferritin',
      'b12',
      'vitamin_d',
      'hemoglobin',
      'alt',
      'ast',
      'kreatinin',
      'urik_asit',
    ]
    expect(LAB_ANALYTE_PRESETS.map((p) => p.code).sort()).toEqual(expectedCodes.sort())
  })

  it('her preset benzersiz bir code taşır', () => {
    const codes = LAB_ANALYTE_PRESETS.map((p) => p.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('her preset en az bir referans sınırı (min veya max) tanımlar', () => {
    for (const preset of LAB_ANALYTE_PRESETS) {
      expect(preset.refMin !== null || preset.refMax !== null).toBe(true)
    }
  })
})

describe('findLabAnalytePreset', () => {
  it('bilinen bir kod için preset döner', () => {
    expect(findLabAnalytePreset('hba1c')).toMatchObject({ nameTr: 'HbA1c', unit: '%' })
  })

  it('bilinmeyen bir kod için undefined döner (serbest metin analit desteklenir)', () => {
    expect(findLabAnalytePreset('bilinmeyen_analit')).toBeUndefined()
  })
})

describe('computeLabAbnormalStatus', () => {
  it('her iki referans sınırı da yoksa null döner (anormal mi sorusu cevaplanamaz)', () => {
    expect(computeLabAbnormalStatus(100, null, null)).toBeNull()
  })

  it('değer refMin altındaysa true döner', () => {
    expect(computeLabAbnormalStatus(60, 70, 99)).toBe(true)
  })

  it('değer refMax üstündeyse true döner', () => {
    expect(computeLabAbnormalStatus(120, 70, 99)).toBe(true)
  })

  it('değer aralık içindeyse false döner', () => {
    expect(computeLabAbnormalStatus(85, 70, 99)).toBe(false)
  })

  it('sınır değerler (tam refMin / tam refMax) normal sayılır', () => {
    expect(computeLabAbnormalStatus(70, 70, 99)).toBe(false)
    expect(computeLabAbnormalStatus(99, 70, 99)).toBe(false)
  })

  it('sadece refMin tanımlıysa (üst sınır yok, ör. HDL) sadece alt sınır kontrol edilir', () => {
    expect(computeLabAbnormalStatus(30, 40, null)).toBe(true)
    expect(computeLabAbnormalStatus(55, 40, null)).toBe(false)
  })

  it('sadece refMax tanımlıysa (alt sınır yok, ör. LDL) sadece üst sınır kontrol edilir', () => {
    expect(computeLabAbnormalStatus(140, null, 130)).toBe(true)
    expect(computeLabAbnormalStatus(110, null, 130)).toBe(false)
  })

  it('negatif olmayan ondalık değerlerde de doğru çalışır', () => {
    expect(computeLabAbnormalStatus(0.3, 0.4, 4)).toBe(true)
    expect(computeLabAbnormalStatus(2.1, 0.4, 4)).toBe(false)
  })

  it('sıfır değeri (ör. bazı alt sınırı 0 olan enzimler) doğru değerlendirilir', () => {
    expect(computeLabAbnormalStatus(0, 0, 41)).toBe(false)
  })

  it('LAB_ANALYTE_PRESETS içindeki her preset ile birlikte tutarlı çalışır', () => {
    for (const preset of LAB_ANALYTE_PRESETS) {
      // Aralığın tam ortasındaki bir değer normal sayılmalı.
      if (preset.refMin !== null && preset.refMax !== null) {
        const mid = (preset.refMin + preset.refMax) / 2
        expect(computeLabAbnormalStatus(mid, preset.refMin, preset.refMax)).toBe(false)
      }
    }
  })
})
