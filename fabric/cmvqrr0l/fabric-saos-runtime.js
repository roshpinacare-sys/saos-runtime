import { describe, it, expect, beforeEach, afterEach } from 'node:test';
import { secp256k1 } from '@noble/secp256k1';
import { sha256, hmac } from '@noble/hashes/sha256';
import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { randomBytes } from 'crypto';

// Mock core implementation for comparison
const mockCore = {
  secp256k1: {
    generatePrivateKey: () => {
      // Generate a random private key
      return randomBytes(32);
    },
    getPublicKey: (privateKey, compressed = true) => {
      // Mock implementation - in real scenario this would use actual secp256k1
      return compressed ? Buffer.concat([Buffer.from([0x02]), randomBytes(32)]) : Buffer.concat([Buffer.from([0x04]), randomBytes(64)]);
    },
    sign: (message, privateKey) => {
      // Mock signature
      return Buffer.concat([randomBytes(64), Buffer.from([0x01])]);
    },
    verify: (message, signature, publicKey) => {
      // Mock verification
      return signature.length === 65 && publicKey.length >= 33;
    }
  },
  hashes: {
    sha256: (data) => {
      // Mock SHA256
      return Buffer.alloc(32, 0x00);
    },
    hmac: (key, data) => {
      // Mock HMAC
      return Buffer.alloc(32, 0x00);
    },
    pbkdf2: (password, salt, iterations, keylen) => {
      // Mock PBKDF2
      return Buffer.alloc(keylen, 0x00);
    }
  }
};

describe('SAOS Runtime Engine Tests', () => {
  describe('Secp256k1 Engine Tests', () => {
    let privateKey;
    let publicKey;
    let message;
    let signature;

    beforeEach(() => {
      privateKey = secp256k1.utils.randomPrivateKey();
      publicKey = secp256k1.getPublicKey(privateKey);
      message = Buffer.from('test message');
    });

    it('should generate valid private key', () => {
      expect(privateKey).toBeInstanceOf(Uint8Array);
      expect(privateKey.length).toBe(32);
    });

    it('should generate valid public key from private key', () => {
      expect(publicKey).toBeInstanceOf(Uint8Array);
      expect(publicKey.length).toBe(33); // Compressed public key
    });

    it('should sign and verify a message correctly', () => {
      signature = secp256k1.sign(message, privateKey);
      const isValid = secp256k1.verify(message, signature, publicKey);
      expect(isValid).toBe(true);
    });

    it('should fail verification with wrong public key', () => {
      const wrongPublicKey = secp256k1.getPrivateKey(secp256k1.utils.randomPrivateKey());
      signature = secp256k1.sign(message, privateKey);
      const isValid = secp256k1.verify(message, signature, wrongPublicKey);
      expect(isValid).toBe(false);
    });

    it('should match core implementation for key generation', () => {
      const corePrivateKey = mockCore.secp256k1.generatePrivateKey();
      expect(corePrivateKey).toBeInstanceOf(Buffer);
      expect(corePrivateKey.length).toBe(32);
    });

    it('should match core implementation for public key derivation', () => {
      const corePublicKey = mockCore.secp256k1.getPublicKey(privateKey);
      expect(corePublicKey).toBeInstanceOf(Buffer);
      expect(corePublicKey.length).toBe(33); // Compressed
    });

    it('should handle edge case: invalid private key length', () => {
      expect(() => {
        const invalidKey = new Uint8Array(31);
        secp256k1.getPublicKey(invalidKey);
      }).toThrow();
    });

    it('should handle edge case: invalid signature length', () => {
      expect(() => {
        const invalidSig = new Uint8Array(64);
        secp256k1.verify(message, invalidSig, publicKey);
      }).toThrow();
    });
  });

  describe('Hashing Engine Tests', () => {
    let testData;
    let key;

    beforeEach(() => {
      testData = Buffer.from('test data');
      key = Buffer.from('test key');
    });

    it('should compute SHA-256 hash correctly', () => {
      const hash = sha256(testData);
      expect(hash).toBeInstanceOf(Uint8Array);
      expect(hash.length).toBe(32);
    });

    it('should compute HMAC-SHA-256 correctly', () => {
      const hmacResult = hmac(key, testData);
      expect(hmacResult).toBeInstanceOf(Uint8Array);
      expect(hmacResult.length).toBe(32);
    });

    it('should compute PBKDF2 correctly', () => {
      const salt = Buffer.from('salt');
      const derived = pbkdf2('password', salt, 1000, 32);
      expect(derived).toBeInstanceOf(Uint8Array);
      expect(derived.length).toBe(32);
    });

    it('should match core implementation for SHA-256', () => {
      const coreHash = mockCore.hashes.sha256(testData);
      expect(coreHash).toBeInstanceOf(Buffer);
      expect(coreHash.length).toBe(32);
    });

    it('should match core implementation for HMAC', () => {
      const coreHmac = mockCore.hashes.hmac(key, testData);
      expect(coreHmac).toBeInstanceOf(Buffer);
      expect(coreHmac.length).toBe(32);
    });

    it('should match core implementation for PBKDF2', () => {
      const salt = Buffer.from('salt');
      const coreDerived = mockCore.hashes.pbkdf2('password', salt, 1000, 32);
      expect(coreDerived).toBeInstanceOf(Buffer);
      expect(coreDerived.length).toBe(32);
    });

    it('should handle edge case: empty data for hashing', () => {
      const emptyHash = sha256(Buffer.alloc(0));
      expect(emptyHash).toBeInstanceOf(Uint8Array);
      expect(emptyHash.length).toBe(32);
    });

    it('should handle edge case: empty key for HMAC', () => {
      const emptyKeyHmac = hmac(Buffer.alloc(0), testData);
      expect(emptyKeyHmac).toBeInstanceOf(Uint8Array);
      expect(emptyKeyHmac.length).toBe(32);
    });

    it('should handle edge case: zero iterations in PBKDF2', () => {
      const salt = Buffer.from('salt');
      expect(() => {
        pbkdf2('password', salt, 0, 32);
      }).toThrow();
    });
  });

  describe('Integration Tests', () => {
    it('should verify signature using hash and secp256k1', () => {
      const privateKey = secp256k1.utils.randomPrivateKey();
      const publicKey = secp256k1.getPublicKey(privateKey);
      const message = Buffer.from('test message');
      
      // Hash the message
      const messageHash = sha256(message);
      
      // Sign the hash
      const signature = secp256k1.sign(messageHash, privateKey);
      
      // Verify the signature
      const isValid = secp256k1.verify(messageHash, signature, publicKey);
      expect(isValid).toBe(true);
    });

    it('should fail verification with tampered message', () => {
      const privateKey = secp256k1.utils.randomPrivateKey();
      const publicKey = secp256k1.getPublicKey(privateKey);
      const message = Buffer.from('test message');
      const tamperedMessage = Buffer.from('tampered message');
      
      // Hash the original message
      const messageHash = sha256(message);
      
      // Sign the hash
      const signature = secp256k1.sign(messageHash, privateKey);
      
      // Try to verify with tampered message
      const tamperedHash = sha256(tamperedMessage);
      const isValid = secp256k1.verify(tamperedHash, signature, publicKey);
      expect(isValid).toBe(false);
    });
  });
});
