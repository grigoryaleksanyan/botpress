import { NLU } from 'botpress/sdk'

import modelIdService from './model-id-service'
import { HALF_MD5_REG } from './tools/crypto'

const intentDefs: NLU.IntentDefinition[] = [
  {
    contexts: ['global'],
    filename: 'Frodo',
    name: 'Frodo',
    slots: [],
    utterances: {
      en: ['I love Samwise Gamgee the brave'],
      fr: ["J'aime Sam Gamgee le brave"]
    }
  }
]

const entityDefs: NLU.EntityDefinition[] = [
  {
    id: 'lotr-places',
    name: 'lotr places',
    type: 'list',
    examples: ['middle earth', 'mordor'],
    fuzzy: 0.5
  }
]

const specifications: NLU.Specifications = {
  nluVersion: '2.0.0',
  languageServer: {
    dimensions: 300,
    domain: 'bp',
    version: '1.1.0'
  }
}

describe('mode id service', () => {
  test('makeId', () => {
    // arrange
    const input = {
      entityDefs,
      intentDefs,
      languageCode: 'fr',
      seed: 42,
      specifications
    }

    // act
    const modelId = modelIdService.makeId(input)

    // assert
    expect(HALF_MD5_REG.exec(modelId.contentHash)).toBeDefined()
    expect(HALF_MD5_REG.exec(modelId.contentHash)).toBeDefined()
    expect(modelId.languageCode).toBe('fr')
    expect(modelId.seed).toBe(42)
  })

  test('toString', () => {
    // arrange
    const input = {
      entityDefs,
      intentDefs,
      languageCode: 'fr',
      seed: 42,
      specifications
    }
    const modelId = modelIdService.makeId(input)

    // act
    const stringId = modelIdService.toString(modelId)

    // assert
    const parts = stringId.split('.')
    expect(parts.length).toBe(4)
    expect(parts[0]).toBe(modelId.contentHash)
    expect(parts[1]).toBe(modelId.specificationHash)
    expect(parts[2]).toBe(`${modelId.seed}`)
    expect(parts[3]).toBe(modelId.languageCode)
  })

  test('fromString', () => {
    // arrange
    const input = {
      entityDefs,
      intentDefs,
      languageCode: 'fr',
      seed: 42,
      specifications
    }

    const modelId = modelIdService.makeId(input)
    const stringId = modelIdService.toString(modelId)

    // act
    const actual = modelIdService.fromString(stringId)

    // assert
    expect(actual).toStrictEqual(modelId)
  })

  test('isId', () => {
    // arrange
    const input = {
      entityDefs,
      intentDefs,
      languageCode: 'fr',
      seed: 42,
      specifications
    }

    const modelId = modelIdService.makeId(input)
    const stringId = modelIdService.toString(modelId)

    // act
    const actual = modelIdService.isId(stringId)

    // assert
    expect(actual).toBeTruthy()
  })

  test('isId with incorrect format should return false', () => {
    const incorrectIds = [
      '',
      'abcdefghijklmnop.0123456789012345.42.en',
      '0123456789012345.abcdefghijklmnop.42.en',
      'a0b1c2d3e4f5a6b7.c8d9eafbacbdcedf.frodo.en',
      'a0b1c2d3e4f5a6b7.c8d9eafbacbdcedf.42.enfr',
      'a0b1c2d3e4f5a6b7.42.en',
      'a0b1c2d3e4f5a6b7.c8d9eafbacbdced.42.en',
      'a0b1c2d3e4f5a6b.c8d9eafbacbdcedf.42.en'
    ]

    for (const stringId of incorrectIds) {
      expect(modelIdService.isId(stringId)).toBeFalsy()
    }
  })
})
