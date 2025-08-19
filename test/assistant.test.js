import { expect } from 'chai';
import sinon from 'sinon';
import { vapi } from '../vapi-agent.js';
import { createAssistant, listAssistants, updateAssistant, deleteAssistant } from '../vapi-agent.js';
import { mockVapiClient } from './utils/mockVapiClient.js';

// Mock the VAPI client
const mockClient = new mockVapiClient();

// Replace the real client with our mock
vapi.assistants = mockClient.assistants;

describe('Assistant Management', () => {
  beforeEach(() => {
    // Reset mock calls before each test
    mockClient.reset();
  });

  describe('createAssistant', () => {
    it('should create a new assistant with valid parameters', async () => {
      const assistantData = {
        name: 'Test Assistant',
        firstMessage: 'Hello!',
        systemPrompt: 'You are a test assistant.',
        options: {
          model: 'gpt-4',
          temperature: 0.7
        }
      };

      const result = await createAssistant(
        assistantData.name,
        assistantData.firstMessage,
        assistantData.systemPrompt,
        assistantData.options
      );

      expect(result).to.have.property('id');
      expect(result.name).to.equal(assistantData.name);
      expect(mockClient.assistants.create.calledOnce).to.be.true;
    });

    it('should throw an error when creation fails', async () => {
      const error = new Error('API Error');
      mockClient.assistants.create.rejects(error);

      await expect(
        createAssistant('Test', 'Hi', 'Test prompt')
      ).to.be.rejectedWith('API Error');
    });
  });

  describe('listAssistants', () => {
    it('should return a list of assistants', async () => {
      const assistants = [
        { id: '1', name: 'Assistant 1' },
        { id: '2', name: 'Assistant 2' }
      ];
      
      mockClient.assistants.list.resolves({ data: assistants });

      const result = await listAssistants();
      
      expect(result).to.be.an('array');
      expect(result).to.have.lengthOf(2);
      expect(mockClient.assistants.list.calledOnce).to.be.true;
    });
  });

  describe('updateAssistant', () => {
    it('should update an existing assistant', async () => {
      const assistantId = 'asst_123';
      const updates = { name: 'Updated Name' };
      const updatedAssistant = { id: assistantId, ...updates };
      
      mockClient.assistants.update.withArgs(assistantId, updates).resolves(updatedAssistant);

      const result = await updateAssistant(assistantId, updates);
      
      expect(result).to.deep.equal(updatedAssistant);
      expect(mockClient.assistants.update.calledWith(assistantId, updates)).to.be.true;
    });
  });

  describe('deleteAssistant', () => {
    it('should delete an existing assistant', async () => {
      const assistantId = 'asst_123';
      mockClient.assistants.delete.resolves({ id: assistantId, deleted: true });

      const result = await deleteAssistant(assistantId);
      
      expect(result).to.have.property('deleted', true);
      expect(mockClient.assistants.delete.calledWith(assistantId)).to.be.true;
    });
  });
});
