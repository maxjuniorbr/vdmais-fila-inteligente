import { registerDecorator, ValidationOptions } from 'class-validator'

export function IsNotFutureDate(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isNotFutureDate',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') return false
          const date = new Date(value)
          return !Number.isNaN(date.getTime()) && date.getTime() <= Date.now()
        },
        defaultMessage() {
          return 'A data de nascimento não pode estar no futuro'
        },
      },
    })
  }
}
