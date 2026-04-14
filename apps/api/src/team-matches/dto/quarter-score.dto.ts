import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Validates that a value is an object whose keys are Q1..Qn strings
 * and values are non-negative integers. Used for quarter-based score maps.
 */
@ValidatorConstraint({ name: 'isQuarterScoreMap', async: false })
export class IsQuarterScoreMapConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    // Cast is safe: Array.isArray + typeof guards above confirm plain object.
    return Object.entries(value as Record<string, unknown>).every(
      ([key, score]) =>
        /^Q\d+$/.test(key) &&
        typeof score === 'number' &&
        Number.isInteger(score) &&
        score >= 0,
    );
  }

  defaultMessage(): string {
    return 'Quarter score map must be an object with Q1..Qn keys and non-negative integer values';
  }
}

export function IsQuarterScoreMap(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsQuarterScoreMapConstraint,
    });
  };
}

/** Quarter-keyed score map: { Q1: number, Q2: number, ... } */
export type QuarterScoreMap = Record<string, number>;
