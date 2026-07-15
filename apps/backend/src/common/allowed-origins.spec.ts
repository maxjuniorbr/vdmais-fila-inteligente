import { parseAllowedOrigins } from './allowed-origins'

describe('parseAllowedOrigins', () => {
  it('falls back to the local dev origin when unset or blank', () => {
    expect(parseAllowedOrigins(undefined)).toEqual(['http://localhost:5173'])
    expect(parseAllowedOrigins('')).toEqual(['http://localhost:5173'])
    expect(parseAllowedOrigins('  ,  ')).toEqual(['http://localhost:5173'])
  })

  it('keeps a single origin as a one-element list', () => {
    expect(parseAllowedOrigins('https://app.example.com')).toEqual(['https://app.example.com'])
  })

  it('splits a comma-separated list and trims each origin', () => {
    expect(
      parseAllowedOrigins('https://app.hml.example.com , https://app.example.com'),
    ).toEqual(['https://app.hml.example.com', 'https://app.example.com'])
  })

  it('drops empty entries from trailing or doubled commas', () => {
    expect(parseAllowedOrigins('https://app.example.com,,')).toEqual(['https://app.example.com'])
  })
})
