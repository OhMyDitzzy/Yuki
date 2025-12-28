# Overview
The queue system is a mechanism for managing running processes and preventing conflicts or duplicate execution. Data is stored in memory (in a socket connection) and is lost when the bot restarts.

## Queue Best Practices
DO:
- Always initialize queue: conn!!.queueName = conn!!.queueName || {}
- Always cleanup in finally block: Ensures cleanup even on errors
- Check both user and global queues: Prevent conflicts
- Store useful metadata: timestamp, status, progress
- Provide clear feedback: Tell user what's happening

DON'T:
- Don't forget finally block: Queue will leak memory
- Don't use queue for persistent data: Use database instead
- Don't skip validation: Always check before adding
- Don't ignore timeout: Long processes should auto-cleanup
- Don't share queue keys: Use unique names per feature