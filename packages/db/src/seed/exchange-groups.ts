import type { exchangeGroupCodeEnum } from '../schema/exchanges'

type ExchangeGroupCode = (typeof exchangeGroupCodeEnum.enumValues)[number]

interface ExchangeGroupSeed {
  code: ExchangeGroupCode
  nameTr: string
  refKcal: string
  refProtein: string
  refCarb: string
  refFat: string
}

// Türk diyetetiğinde yaygın kullanılan standart değişim değerleri (BDPD değişim
// listesi referans alınmıştır). Bu değerler bir diyetisyenle birlikte doğrulanmalı
// (bkz. roadmap "Son Not" — Hafta 1'in en riskli noktalarından biri budur).
export const exchangeGroupsSeed: ExchangeGroupSeed[] = [
  { code: 'EKMEK', nameTr: 'Ekmek', refKcal: '68', refProtein: '2', refCarb: '15', refFat: '0' },
  { code: 'ET', nameTr: 'Et', refKcal: '75', refProtein: '7', refCarb: '0', refFat: '5' },
  { code: 'SUT', nameTr: 'Süt', refKcal: '150', refProtein: '8', refCarb: '12', refFat: '8' },
  { code: 'MEYVE', nameTr: 'Meyve', refKcal: '60', refProtein: '0', refCarb: '15', refFat: '0' },
  { code: 'SEBZE', nameTr: 'Sebze', refKcal: '25', refProtein: '1', refCarb: '5', refFat: '0' },
  { code: 'YAG', nameTr: 'Yağ', refKcal: '45', refProtein: '0', refCarb: '0', refFat: '5' },
]
