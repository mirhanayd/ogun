import { describe, expect, it } from 'vitest'
import { parseFoodInput } from './parse-food-input'

// GitHub issue #24 / Prompt 5.2 GÖREV 2 — en az 30 gerçekçi girdi örneği.
describe('parseFoodInput', () => {
  it('roadmap gövdesindeki birebir örnekleri ayrıştırır', () => {
    expect(parseFoodInput('1 kase mercimek çorbası')).toEqual({
      amount: 1,
      portion: 'kase',
      query: 'mercimek çorbası',
    })
    expect(parseFoodInput('150 gr tavuk göğsü')).toEqual({
      amount: 150,
      unit: 'g',
      query: 'tavuk göğsü',
    })
    expect(parseFoodInput('2 orta boy elma')).toEqual({
      amount: 2,
      portion: 'orta boy',
      query: 'elma',
    })
    expect(parseFoodInput('yarım bardak süt')).toEqual({
      amount: 0.5,
      portion: 'bardak',
      query: 'süt',
    })
    expect(parseFoodInput('1,5 yemek kaşığı zeytinyağı')).toEqual({
      amount: 1.5,
      portion: 'yemek kaşığı',
      query: 'zeytinyağı',
    })
  })

  it('sayısal ve Türkçe sayı sözcüğü miktarları ayrıştırır', () => {
    expect(parseFoodInput('3 muz')).toEqual({ amount: 3, query: 'muz' })
    expect(parseFoodInput('iki yumurta')).toEqual({ amount: 2, query: 'yumurta' })
    expect(parseFoodInput('üç dilim ekmek')).toEqual({ amount: 3, portion: 'dilim', query: 'ekmek' })
    expect(parseFoodInput('çeyrek karpuz')).toEqual({ amount: 0.25, query: 'karpuz' })
    expect(parseFoodInput('bir adet portakal')).toEqual({ amount: 1, portion: 'adet', query: 'portakal' })
    expect(parseFoodInput('beş tane badem')).toEqual({ amount: 5, query: 'tane badem' })
    expect(parseFoodInput('10 adet çilek')).toEqual({ amount: 10, portion: 'adet', query: 'çilek' })
    expect(parseFoodInput('20 gr ceviz')).toEqual({ amount: 20, unit: 'g', query: 'ceviz' })
  })

  it('ondalık ayırıcı olarak virgül ve noktayı destekler', () => {
    expect(parseFoodInput('0,5 kg patates')).toEqual({ amount: 0.5, unit: 'kg', query: 'patates' })
    expect(parseFoodInput('2.5 dilim karpuz')).toEqual({ amount: 2.5, portion: 'dilim', query: 'karpuz' })
    expect(parseFoodInput('1,25 litre ayran')).toEqual({ amount: 1.25, unit: 'l', query: 'ayran' })
  })

  it('farklı birim yazımlarını tanır', () => {
    expect(parseFoodInput('100 g pirinç')).toEqual({ amount: 100, unit: 'g', query: 'pirinç' })
    expect(parseFoodInput('200 gram yoğurt')).toEqual({ amount: 200, unit: 'g', query: 'yoğurt' })
    expect(parseFoodInput('1 kg elma')).toEqual({ amount: 1, unit: 'kg', query: 'elma' })
    expect(parseFoodInput('250 ml süt')).toEqual({ amount: 250, unit: 'ml', query: 'süt' })
    expect(parseFoodInput('1 lt su')).toEqual({ amount: 1, unit: 'l', query: 'su' })
    expect(parseFoodInput('1 litre ayran')).toEqual({ amount: 1, unit: 'l', query: 'ayran' })
  })

  it('ev ölçüsü/porsiyon ifadelerini tanır', () => {
    expect(parseFoodInput('1 su bardağı süt')).toEqual({ amount: 1, portion: 'su bardağı', query: 'süt' })
    expect(parseFoodInput('2 çay bardağı çay')).toEqual({ amount: 2, portion: 'çay bardağı', query: 'çay' })
    expect(parseFoodInput('1 tatlı kaşığı bal')).toEqual({ amount: 1, portion: 'tatlı kaşığı', query: 'bal' })
    expect(parseFoodInput('2 çay kaşığı şeker')).toEqual({ amount: 2, portion: 'çay kaşığı', query: 'şeker' })
    expect(parseFoodInput('1 kaşık reçel')).toEqual({ amount: 1, portion: 'kaşık', query: 'reçel' })
    expect(parseFoodInput('1 porsiyon köfte')).toEqual({ amount: 1, portion: 'porsiyon', query: 'köfte' })
    expect(parseFoodInput('1 avuç fındık')).toEqual({ amount: 1, portion: 'avuç', query: 'fındık' })
    expect(parseFoodInput('1 tabak salata')).toEqual({ amount: 1, portion: 'tabak', query: 'salata' })
    expect(parseFoodInput('1 kutu yoğurt')).toEqual({ amount: 1, portion: 'kutu', query: 'yoğurt' })
    expect(parseFoodInput('1 paket bisküvi')).toEqual({ amount: 1, portion: 'paket', query: 'bisküvi' })
    expect(parseFoodInput('1 dal maydanoz')).toEqual({ amount: 1, portion: 'dal', query: 'maydanoz' })
    expect(parseFoodInput('2 diş sarımsak')).toEqual({ amount: 2, portion: 'diş', query: 'sarımsak' })
    expect(parseFoodInput('1 demet roka')).toEqual({ amount: 1, portion: 'demet', query: 'roka' })
    expect(parseFoodInput('1 salkım üzüm')).toEqual({ amount: 1, portion: 'salkım', query: 'üzüm' })
    expect(parseFoodInput('1 küçük boy patates')).toEqual({ amount: 1, portion: 'küçük boy', query: 'patates' })
    expect(parseFoodInput('1 büyük boy elma')).toEqual({ amount: 1, portion: 'büyük boy', query: 'elma' })
  })

  it('miktar belirtilmeyen girdilerde amount=1 varsayar', () => {
    expect(parseFoodInput('elma')).toEqual({ amount: 1, query: 'elma' })
    expect(parseFoodInput('mercimek çorbası')).toEqual({ amount: 1, query: 'mercimek çorbası' })
  })

  it('çok kelimeli besin adlarını olduğu gibi query alanına bırakır', () => {
    expect(parseFoodInput('1 porsiyon ızgara tavuk göğsü')).toEqual({
      amount: 1,
      portion: 'porsiyon',
      query: 'ızgara tavuk göğsü',
    })
    expect(parseFoodInput('2 dilim tam buğday ekmeği')).toEqual({
      amount: 2,
      portion: 'dilim',
      query: 'tam buğday ekmeği',
    })
  })

  it('büyük/küçük harf ve fazla boşluklara karşı toleranslıdır', () => {
    expect(parseFoodInput('  1   Kase   Mercimek   Çorbası  ')).toEqual({
      amount: 1,
      portion: 'kase',
      query: 'mercimek çorbası',
    })
    expect(parseFoodInput('150 GR Tavuk Göğsü')).toEqual({ amount: 150, unit: 'g', query: 'tavuk göğsü' })
  })

  it('boş girdi için amount=1 ve boş query döner', () => {
    expect(parseFoodInput('')).toEqual({ amount: 1, query: '' })
    expect(parseFoodInput('   ')).toEqual({ amount: 1, query: '' })
  })

  it('sadece birim/porsiyon olup besin adı olmayan girdilerde query boş kalır', () => {
    expect(parseFoodInput('100 gr')).toEqual({ amount: 100, unit: 'g', query: '' })
    expect(parseFoodInput('1 kase')).toEqual({ amount: 1, portion: 'kase', query: '' })
  })
})
