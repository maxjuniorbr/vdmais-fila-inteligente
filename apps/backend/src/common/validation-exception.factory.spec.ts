import type { ValidationError } from 'class-validator'
import { validationExceptionFactory } from './validation-exception.factory'

describe('validationExceptionFactory', () => {
  it('traduz mensagens padrão de validação para pt-BR', () => {
    const errors = [
      {
        property: 'email',
        constraints: { isEmail: 'email must be an email' },
      },
      {
        property: 'unexpected',
        constraints: {
          whitelistValidation: 'property unexpected should not exist',
        },
      },
    ] as ValidationError[]

    expect(validationExceptionFactory(errors).getResponse()).toEqual({
      error: 'Bad Request',
      message: ['E-mail deve ser válido', 'unexpected não é permitido'],
      statusCode: 400,
    })
  })

  it('preserva mensagens específicas já escritas em pt-BR', () => {
    const errors = [
      {
        property: 'phone',
        constraints: { matches: 'O telefone deve ter 10 ou 11 dígitos' },
      },
    ] as ValidationError[]

    expect(validationExceptionFactory(errors).getResponse()).toEqual({
      error: 'Bad Request',
      message: ['O telefone deve ter 10 ou 11 dígitos'],
      statusCode: 400,
    })
  })

  it('recurses into nested child errors', () => {
    const errors = [
      {
        property: 'address',
        children: [
          {
            property: 'zip',
            constraints: { isNotEmpty: 'zip should not be empty' },
          },
        ],
      },
    ] as ValidationError[]

    expect(validationExceptionFactory(errors).getResponse()).toMatchObject({
      message: ['zip é obrigatório'],
    })
  })
})
