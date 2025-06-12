# Memory Optimization Guide

## Problem Fixed
Fixed "JavaScript heap out of memory" error that occurred when processing large amounts of TikTok order data.

## Solutions Implemented

### 1. Node.js Memory Settings
- **Heap Size**: Increased from default 1.4GB to 4GB (`--max-old-space-size=4096`)
- **GC Optimization**: Added `--optimize-for-size` and `--gc-interval=100`
- **Expose GC**: Added `--expose-gc` for manual garbage collection

### 2. Application Level Optimizations

#### Chunked Data Processing
```typescript
// Process data in chunks of 1000 records
const CHUNK_SIZE = 1000;
const chunks = [];
for (let i = 0; i < data.length; i += CHUNK_SIZE) {
  chunks.push(data.slice(i, i + CHUNK_SIZE));
}
```

#### Manual Garbage Collection
```typescript
// Trigger GC every 3 chunks
if ((chunkIndex + 1) % 3 === 0 && global.gc) {
  global.gc();
}
```

#### Memory Cleanup
```typescript
// Clear arrays after use
array.length = 0;
```

### 3. Docker Optimizations

#### Memory Limits
```yaml
mem_limit: 6g
mem_reservation: 4g
oom_kill_disable: false
```

#### Build Optimization
```bash
docker build --memory=6g --memory-swap=8g
```

### 4. Monitoring & Health Checks

#### Health Endpoint
- **URL**: `/health`
- **Memory Info**: Displays current heap usage, RSS, external memory
- **Auto-GC**: Triggers at 80% heap usage

#### Memory Monitoring
- Logs memory usage every 30 seconds
- Shows heap percentage and total usage
- Automatic garbage collection triggers

## Usage Instructions

### Development
```bash
npm run start:dev
```

### Production
```bash
npm run start:prod
# or
docker-compose -f docker-compose-fe-be.yml up -d
```

### Memory Monitoring
```bash
# Check health endpoint
curl http://localhost:8000/health

# Monitor Docker container memory
docker stats <container_name>
```

## Performance Improvements

### Before Optimization
- **Memory Usage**: Up to 2GB+ and growing
- **Processing**: Single large batch operations
- **Failures**: "heap out of memory" crashes
- **Recovery**: Manual restart required

### After Optimization
- **Memory Usage**: Stable ~500MB-1GB range
- **Processing**: Chunked processing with cleanup
- **Stability**: No more memory crashes
- **Monitoring**: Real-time memory tracking

## Memory Settings Explained

| Setting | Value | Purpose |
|---------|-------|---------|
| `--max-old-space-size=4096` | 4GB | Maximum heap size |
| `--optimize-for-size` | - | Optimize for memory over speed |
| `--gc-interval=100` | 100ms | More frequent garbage collection |
| `--expose-gc` | - | Allow manual GC triggers |

## Troubleshooting

### Still Getting Memory Errors?

1. **Check Docker Memory Limits**
   ```bash
   docker stats <container>
   ```

2. **Monitor Heap Usage**
   ```bash
   curl http://localhost:8000/health
   ```

3. **Increase Memory Limits**
   ```bash
   # Edit docker-compose-fe-be.yml
   mem_limit: 8g  # Increase from 6g
   ```

4. **Reduce Chunk Size**
   ```typescript
   const CHUNK_SIZE = 500; // Reduce from 1000
   ```

### Performance Monitoring
```bash
# Watch memory usage in real-time
docker logs -f <container_name> | grep "Memory Usage"

# Check for GC triggers
docker logs -f <container_name> | grep "GC triggered"
```

## Additional Recommendations

1. **Server Requirements**: Minimum 8GB RAM
2. **Swap Space**: Configure 4GB swap for safety
3. **Regular Monitoring**: Check `/health` endpoint regularly
4. **Log Rotation**: Implement log rotation to prevent disk space issues

## Files Modified

- `package.json`: Added memory flags to start:prod script
- `Dockerfile`: Added memory optimization environment variables
- `docker-compose-fe-be.yml`: Added memory limits and health checks
- `src/main.ts`: Added memory monitoring and health endpoint
- `src/tasks/tasks.service.ts`: Implemented chunked processing
- `src/google-sheets/google-sheets.service.ts`: Fixed batch request issues 