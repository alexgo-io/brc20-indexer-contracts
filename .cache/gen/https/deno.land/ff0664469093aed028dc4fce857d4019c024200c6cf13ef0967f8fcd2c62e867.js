const maxCapacity = Math.pow(2, 32) - 1;
function positiveIndex(length, index, inclusive = false) {
    index = Math.floor(index);
    if (index < -length) index = 0;
    if (index < 0) index += length;
    if (index >= length) index = length - (inclusive ? 1 : 0);
    return index;
}
function reduce(iterator, length, step, callback, initialValue) {
    if (typeof initialValue === "undefined" && length === 0) {
        throw new TypeError("cannot reduce empty vector with no initial value");
    }
    let result;
    let index = step < 0 ? length - 1 : 0;
    if (typeof initialValue === "undefined") {
        result = iterator.next().value;
        index += step;
    } else {
        result = initialValue;
    }
    for (const current of iterator){
        result = callback(result, current, index);
        index += step;
    }
    return result;
}
/**
 * A double-ended queue implemented with a growable ring buffer.
 * Vector is faster than JavaScript's built in Array class for shifting and unshifting
 * because it only requires reallocation when increasing the capacity.
 */ export class Vector {
    data;
    _capacity = 0;
    _length = 0;
    start = 0;
    end = -1;
    constructor(capacity = 0){
        if (typeof capacity !== "number" || Math.floor(capacity) !== capacity) {
            throw new TypeError("invalid capacity");
        } else if (capacity < 0 || capacity > maxCapacity) {
            throw new RangeError("invalid capacity");
        }
        this._capacity = capacity;
        this.data = [];
        this.data.length = capacity;
    }
    static from(collection, options) {
        let result;
        if (collection instanceof Vector) {
            if (options?.map) {
                result = collection.map(options.map, options.thisArg);
            } else {
                result = new Vector();
                result.data = Array.from(collection.data);
                result._capacity = collection.capacity;
                result._length = collection.length;
                result.start = collection.start;
                result.end = collection.end;
            }
        } else {
            result = new Vector();
            result.data = options?.map ? Array.from(collection, options?.map, options?.thisArg) : Array.from(collection);
            result._length = result.data.length;
            result._capacity = result._length;
            result.start = 0;
            result.end = result._length - 1;
        }
        return result;
    }
    /**
   * The amount of values stored in the vector.
   * You can set the length to truncate the vector.
   * If you increase the length by setting it, the new slots will be empty.
   */ get length() {
        return this._length;
    }
    set length(value) {
        if (value === 0) {
            if (this.length !== 0) this.data = [];
            this.data.length = this.capacity;
            this.start = 0;
            this.end = -1;
        } else if (typeof value !== "number" || Math.floor(value) !== value) {
            throw new TypeError("invalid length");
        } else if (value < 0 || value > maxCapacity) {
            throw new RangeError("invalid length");
        } else if (value < this.length) {
            const previousEnd = this.end;
            this.end = (this.start + value - 1) % this.capacity;
            if (previousEnd < this.start && this.end >= this.start) {
                this.data.fill(undefined, this.end + 1, this.capacity);
                this.data.fill(undefined, 0, previousEnd + 1);
            } else {
                this.data.fill(undefined, this.end + 1, previousEnd + 1);
            }
        } else if (value > this.capacity) {
            this.capacity = value;
            this.end = (this.start + value - 1) % this.capacity;
        } else if (value > this.length) {
            this.end = (this.start + value - 1) % this.capacity;
        }
        this._length = value;
    }
    /**
   * The vector will be able to hold this many values without reallocating.
   * If the length exceeds the capacity, then the capacity will be increased.
   * Changing the capacity may trigger reallocation.
   * Changing the capacity to less than the length will change
   * the length to be equal to the new capacity.
   */ get capacity() {
        return this._capacity;
    }
    set capacity(value) {
        if (value === 0) {
            this._capacity = 0;
            this.clear();
        } else if (typeof value !== "number" || Math.floor(value) !== value) {
            throw new TypeError("invalid capacity");
        } else if (value < 0 || value > maxCapacity) {
            throw new RangeError("invalid capacity");
        } else if (value < this.length) {
            this._length = value;
            this.end = (this.start + value - 1) % this.capacity;
            this.data = this.toArray();
            this.start = 0;
            this.end = value - 1;
        } else if (this.end < this.start && value !== this.capacity) {
            this.data = this.data.slice(this.start, this.capacity).concat(this.data.slice(0, this.end + 1));
            this.start = 0;
            this.end = this.length - 1;
        } else if (this.end >= value) {
            this.data = this.data.slice(this.start, this.end + 1);
            this.start = 0;
            this.end = this.length - 1;
        }
        this.data.length = value;
        this._capacity = value;
    }
    /**
   * Returns the value at the given index.
   * If the value is negative, it will be subtracted from the end.
   * The index 0 would return the first value in the vector.
   * The index -1 would return the last value in the vector.
   */ get(index) {
        if (index < -this.length || index >= this.length) return;
        index = positiveIndex(this.length, index);
        index = (this.start + index) % this.capacity;
        return this.data[index];
    }
    /**
   * Sets the value at the given index, then returns the value.
   * If the value is negative, it will be subtracted from the end.
   * The index 0 would set the first value in the vector.
   * The index -1 would set the last value in the vector.
   * If the absolute index value is greater than the length,
   * the size will be increased to match before setting the value.
   */ set(index, value) {
        const offset = (index < 0 ? Math.abs(index) : index + 1) - this.length;
        if (offset > 0) {
            const newLength = this.length + offset;
            let newCapacity = this.capacity || 1;
            while(newCapacity < newLength)newCapacity *= 2;
            this.capacity = newCapacity;
            this.length = newLength;
        }
        if (index < 0) {
            if (offset > 0) {
                this.start -= offset;
                this.end -= offset;
                if (this.start < 0) this.start += this.capacity;
                if (this.end < 0) this.end += this.capacity;
            }
            index = this.end + index + 1;
            if (index < 0) index = this.capacity + index;
        } else {
            index = (this.start + index) % this.capacity;
        }
        this.data[index] = value;
        return value;
    }
    /**
   * Removes and returns the value at index from the vector.
   * If the value is negative, it will be subtracted from the end.
   * The values between the index and the end will be shifted to the left.
   */ delete(index) {
        let value;
        if (this.length !== 0 && index < this.length && index >= -this.length) {
            value = this.splice(index, 1).get(0);
        }
        return value;
    }
    /** Shrinks the capacity to be equal to the length. */ shrinkToFit() {
        this.capacity = this.length;
    }
    /** Returns the first value in the vector, or undefined if it is empty. */ peek() {
        return this.data[this.start];
    }
    /** Removes the first value from the vector and returns it, or undefined if it is empty. */ shift() {
        const result = this.data[this.start];
        if (this.length > 0) {
            this.data[this.start] = undefined;
            this._length--;
            this.start = this.start === this.capacity ? 0 : (this.start + 1) % this.capacity;
        }
        return result;
    }
    /** Adds values to the start of the vector. */ unshift(...values) {
        const newLength = this.length + values.length;
        let newCapacity = this.capacity || 1;
        while(newCapacity < newLength)newCapacity *= 2;
        this.capacity = newCapacity;
        this.length = newLength;
        this.start = values.length < this.start ? this.start - values.length : this.capacity - values.length + this.start;
        this.end = (this.start + this.length - 1) % this.capacity;
        let index = this.start;
        for (const value of values){
            this.data[(index++) % this.capacity] = value;
        }
        return this.length;
    }
    /** Returns the last value in the vector, or undefined if it is empty. */ peekRight() {
        return this.data[this.end];
    }
    /** Removes the last value from the vector and returns it, or undefined if it is empty. */ pop() {
        const result = this.data[this.end];
        if (this.length > 0) {
            this.data[this.end] = undefined;
            this._length--;
            this.end = (this.end || this.capacity) - 1;
        }
        return result;
    }
    /** Adds values to the end of the vector. */ push(...values) {
        const oldLength = this.length;
        const newLength = oldLength + values.length;
        let newCapacity = this.capacity || 1;
        while(newCapacity < newLength)newCapacity *= 2;
        this.capacity = newCapacity;
        this.length = newLength;
        let index = (this.start + oldLength) % this.capacity;
        for (const value of values){
            this.data[(index++) % this.capacity] = value;
        }
        return this.length;
    }
    /**
   * Applies a function against an accumulator and each value of the vector (from left-to-right) to reduce it to a single value.
   * If no initial value is supplied, the first value in the vector will be used and skipped.
   * Calling reduce on an empty array without an initial value creates a TypeError.
   */ reduce(callback, initialValue) {
        return reduce(this.values(), this.length, 1, callback, initialValue);
    }
    /**
   * Applies a function against an accumulator and each value of the vector (from right-to-left) to reduce it to a single value.
   * If no initial value is supplied, the last value in the vector will be used and skipped.
   * Calling reduce on an empty array without an initial value creates a TypeError.
   */ reduceRight(callback, initialValue) {
        return reduce(this.valuesRight(), this.length, -1, callback, initialValue);
    }
    /**
   * Creates and returns a new string concatenating all of the values in the Vector,
   * converted to strings using their toString methods and
   * separated by commas or a specified separator string.
   */ join(separator = ",") {
        const iterator = this.values();
        let result = "";
        let started = false;
        for (const value of iterator){
            if (started) result += separator;
            result += value?.toString() ?? "";
            if (!started) started = true;
        }
        return result;
    }
    /**
   * Creates and returns a new string concatenating all of the values in the Vector,
   * converted to strings using their toString methods and separated by commas.
   */ toString() {
        return this.join();
    }
    /**
   * Creates and returns a new string concatenating all of the values in the Vector,
   * converted to strings using their toLocaleString methods and
   * separated by a locale-specific string.
   */ toLocaleString() {
        return this.toArray().toLocaleString();
    }
    /**
   * Returns a shallow copy of a portion of the vector into a new vector.
   * The start and end represent the index of values in the vector.
   * The end is exclusive meaning it will not be included.
   * If the index value is negative, it will be subtracted from the end of the vector.
   * For example, `vector.slice(-2)` would return a new vector
   * containing the last 2 values.
   */ slice(start = 0, end) {
        const vector = new Vector();
        start = positiveIndex(this.length, start);
        end = positiveIndex(this.length, end ?? this.length);
        if (start >= end) return vector;
        start = (this.start + start) % this.capacity;
        end = (this.start + end) % this.capacity;
        vector.data = end > start ? this.data.slice(start, end) : this.data.slice(start, this.capacity).concat(this.data.slice(0, end));
        vector._length = vector.data.length;
        vector._capacity = vector._length;
        vector.end = vector._length - 1;
        return vector;
    }
    splice(start, deleteCount, ...insertValues) {
        start = positiveIndex(this.length, start);
        deleteCount = deleteCount ?? this.length - start;
        if (deleteCount < 0) deleteCount = 0;
        let end = start + deleteCount;
        if (end > this.length) end = this.length;
        const removed = this.slice(start, end);
        let offset = start - end + insertValues.length;
        const before = start;
        const after = this.length - end;
        if (offset) {
            if (offset > 0) {
                this.length += offset;
                if (before < after) {
                    this.start -= offset;
                    this.end -= offset;
                    if (this.start < 0) this.start += this.capacity;
                    if (this.end < 0) this.end += this.capacity;
                    for(let i = 0; i < before; i++){
                        this.set(i, this.get(i + offset));
                    }
                } else {
                    for(let i1 = 1; i1 <= after; i1++){
                        const index = this.length - i1;
                        this.set(index, this.get(index - offset));
                    }
                }
            } else {
                offset *= -1;
                if (before < after) {
                    start += offset;
                    for(let i2 = 1; i2 <= before; i2++){
                        const index1 = start - i2;
                        this.set(index1, this.get(index1 - offset));
                    }
                    this.start += offset;
                    this.end += offset;
                    if (this.start < 0) this.start += this.capacity;
                    if (this.end < 0) this.end += this.capacity;
                } else {
                    end -= offset;
                    for(let i3 = 0; i3 < after; i3++){
                        const index2 = end + i3;
                        this.set(index2, this.get(index2 + offset));
                    }
                }
                this.length -= offset;
            }
        }
        for(let i4 = 0; i4 < insertValues.length; i4++){
            this.set(start + i4, insertValues[i4]);
        }
        return removed;
    }
    /**
   * Reverses the vector in place then returns it.
   */ reverse() {
        const mid = Math.floor(this.length / 2);
        for(let i = 0; i < mid; i++){
            const temp = this.get(i);
            const j = this.length - i - 1;
            this.set(i, this.get(j));
            this.set(j, temp);
        }
        return this;
    }
    forEach(callback, thisArg, start, end) {
        if (typeof thisArg === "number") {
            end = start;
            start = thisArg;
            thisArg = undefined;
        }
        start = positiveIndex(this.length, start ?? 0);
        end = positiveIndex(this.length, end ?? this.length);
        for(let i = start; i < end; i++){
            callback.call(thisArg, this.get(i), i, this);
        }
    }
    map(callback, thisArg, start, end) {
        if (typeof thisArg === "number") {
            end = start;
            start = thisArg;
            thisArg = undefined;
        }
        start = positiveIndex(this.length, start ?? 0);
        end = positiveIndex(this.length, end ?? this.length);
        const result = start === 0 && end === this.length ? Vector.from(this) : this.slice(start, end);
        const offset = start;
        start = 0;
        end = result.length;
        for(let i = start; i < end; i++){
            result.set(i, callback.call(thisArg, this.get(i + offset), i + offset, this));
        }
        return result;
    }
    findIndex(callback, thisArg, start, end) {
        if (typeof thisArg === "number") {
            end = start;
            start = thisArg;
            thisArg = undefined;
        }
        start = positiveIndex(this.length, start ?? 0);
        end = positiveIndex(this.length, end ?? this.length);
        for(let i = start; i < end; i++){
            if (callback.call(thisArg, this.get(i), i, this)) return i;
        }
        return -1;
    }
    findLastIndex(callback, thisArg, start, end) {
        if (typeof thisArg === "number") {
            end = start;
            start = thisArg;
            thisArg = undefined;
        }
        start = positiveIndex(this.length, start ?? 0);
        end = positiveIndex(this.length, end ?? this.length);
        for(let i = end - 1; i >= start; i--){
            if (callback.call(thisArg, this.get(i), i, this)) return i;
        }
        return -1;
    }
    find(callback, thisArg, start, end) {
        const index = this.findIndex(callback, thisArg, start, end);
        return index !== -1 ? this.get(index) : undefined;
    }
    findLast(callback, thisArg, start, end) {
        const index = this.findLastIndex(callback, thisArg, start, end);
        return index !== -1 ? this.get(index) : undefined;
    }
    some(callback, thisArg, start, end) {
        const index = this.findIndex(callback, thisArg, start, end);
        return index !== -1;
    }
    every(callback, thisArg, start, end) {
        const index = this.findIndex(function(value, index, vector) {
            return !callback.call(this, value, index, vector);
        }, thisArg, start, end);
        return index === -1;
    }
    /**
   * Returns the first index at which the search value can be found in the vector,
   * or -1 if it is not found. This uses strict equality checks.
   * Optionally, you can search a subset of the vector by providing an index range.
   * The start and end represent the index of values in the vector.
   * The end is exclusive meaning it will not be included.
   * If the index value is negative, it will be subtracted from the end of the vector.
   */ indexOf(searchValue, start, end) {
        return this.findIndex((value)=>value === searchValue, start, end);
    }
    /**
   * Returns the last index at which the search value can be found in the vector,
   * or -1 if it is not found. This uses strict equality checks.
   * Optionally, you can search a subset of the vector by providing an index range.
   * The start and end represent the index of values in the vector.
   * The end is exclusive meaning it will not be included.
   * If the index value is negative, it will be subtracted from the end of the vector.
   */ lastIndexOf(searchValue, start, end) {
        return this.findLastIndex((value)=>value === searchValue, start, end);
    }
    /**
   * Returns true if the search value can be found in the vector,
   * or false if it is not found. This uses strict equality checks.
   * Optionally, you can search a subset of the vector by providing an index range.
   * The start and end represent the index of values in the vector.
   * The end is exclusive meaning it will not be included.
   * If the index value is negative, it will be subtracted from the end of the vector.
   */ includes(searchValue, start, end) {
        const index = this.indexOf(searchValue, start, end);
        return index !== -1;
    }
    /**
   * Merges two or more iterables together.
   * This does not change existing Iterables, it returns a new Vector.
   */ concat(...values) {
        const vector = new Vector();
        vector.data = this.toArray();
        vector.data = vector.data.concat.apply(vector.data, values.map((value)=>{
            return value instanceof Vector ? value.toArray() : value;
        }));
        vector._length = vector.data.length;
        vector._capacity = vector._length;
        vector.end = vector._length - 1;
        return vector;
    }
    /**
   * Sorts the values of the vector in place then returns it.
   * This uses Array sort method internally.
   * If the vector has been shifted it may trigger reallocation before sorting.
   */ sort(compare) {
        if (this.start !== 0) {
            this.data = this.toArray();
            this.start = 0;
            this.end = this.length - 1;
        }
        if (compare) this.data.sort(compare);
        else this.data.sort();
        return this;
    }
    /** Removes all values from the vector. */ clear() {
        if (this.length !== 0) {
            this.data = [];
            this.data.length = this.capacity;
            this._length = 0;
        }
        this.start = 0;
        this.end = -1;
    }
    /** Checks if the vector is empty. */ isEmpty() {
        return this.length === 0;
    }
    /**
   * Converts the vector to an array.
   * It's recommended to use this instead of `Array.from` because
   * this method is significantly faster.
   */ toArray() {
        return this.end >= this.start ? this.data.slice(this.start, this.end + 1) : this.data.slice(this.start, this.capacity).concat(this.data.slice(0, this.end + 1));
    }
    /** Returns an iterator for retrieving and removing values from the vector (from left-to-right). */ *drain() {
        while(!this.isEmpty()){
            yield this.shift();
        }
    }
    /** Returns an iterator for retrieving and removing values from the vector (from right-to-left). */ *drainRight() {
        while(!this.isEmpty()){
            yield this.pop();
        }
    }
    /** Returns an iterator for retrieving values from the vector (from left-to-right). */ *values() {
        let offset = 0;
        while(offset < this.length){
            const idx = (this.start + offset++) % this.capacity;
            yield this.data[idx];
        }
    }
    /** Returns an iterator for retrieving values from the vector (from right-to-left). */ *valuesRight() {
        let offset = 0;
        while(offset < this.length){
            let index = this.end - offset++;
            if (index < 0) index = this.capacity + index;
            yield this.data[index];
        }
    }
    /** Returns an iterator for retrieving values from the vector (from left-to-right). */ *[Symbol.iterator]() {
        yield* this.values();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvY29sbGVjdGlvbnNAMC4xMS4yL3ZlY3Rvci50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKiogVGhpcyBtb2R1bGUgaXMgYnJvd3NlciBjb21wYXRpYmxlLiAqL1xuXG5pbXBvcnQgdHlwZSB7IGNvbXBhcmUsIG1hcCB9IGZyb20gXCIuL2NvbW1vbi50c1wiO1xuXG5jb25zdCBtYXhDYXBhY2l0eTogbnVtYmVyID0gTWF0aC5wb3coMiwgMzIpIC0gMTtcblxuZnVuY3Rpb24gcG9zaXRpdmVJbmRleChsZW5ndGg6IG51bWJlciwgaW5kZXg6IG51bWJlciwgaW5jbHVzaXZlID0gZmFsc2UpIHtcbiAgaW5kZXggPSBNYXRoLmZsb29yKGluZGV4KTtcbiAgaWYgKGluZGV4IDwgLWxlbmd0aCkgaW5kZXggPSAwO1xuICBpZiAoaW5kZXggPCAwKSBpbmRleCArPSBsZW5ndGg7XG4gIGlmIChpbmRleCA+PSBsZW5ndGgpIGluZGV4ID0gbGVuZ3RoIC0gKGluY2x1c2l2ZSA/IDEgOiAwKTtcbiAgcmV0dXJuIGluZGV4O1xufVxuXG5mdW5jdGlvbiByZWR1Y2U8VCwgVT4oXG4gIGl0ZXJhdG9yOiBJdGVyYWJsZUl0ZXJhdG9yPFQ+LFxuICBsZW5ndGg6IG51bWJlcixcbiAgc3RlcDogLTEgfCAxLFxuICBjYWxsYmFjazogKHByZXZpb3VzVmFsdWU6IFUsIGN1cnJlbnRWYWx1ZTogVCwgY3VycmVudEluZGV4OiBudW1iZXIpID0+IFUsXG4gIGluaXRpYWxWYWx1ZT86IFUsXG4pOiBVIHtcbiAgaWYgKHR5cGVvZiBpbml0aWFsVmFsdWUgPT09IFwidW5kZWZpbmVkXCIgJiYgbGVuZ3RoID09PSAwKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcImNhbm5vdCByZWR1Y2UgZW1wdHkgdmVjdG9yIHdpdGggbm8gaW5pdGlhbCB2YWx1ZVwiKTtcbiAgfVxuICBsZXQgcmVzdWx0OiBVO1xuICBsZXQgaW5kZXg6IG51bWJlciA9IHN0ZXAgPCAwID8gbGVuZ3RoIC0gMSA6IDA7XG4gIGlmICh0eXBlb2YgaW5pdGlhbFZhbHVlID09PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgcmVzdWx0ID0gaXRlcmF0b3IubmV4dCgpLnZhbHVlO1xuICAgIGluZGV4ICs9IHN0ZXA7XG4gIH0gZWxzZSB7XG4gICAgcmVzdWx0ID0gaW5pdGlhbFZhbHVlO1xuICB9XG4gIGZvciAoY29uc3QgY3VycmVudCBvZiBpdGVyYXRvcikge1xuICAgIHJlc3VsdCA9IGNhbGxiYWNrKHJlc3VsdCwgY3VycmVudCwgaW5kZXgpO1xuICAgIGluZGV4ICs9IHN0ZXA7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuZXhwb3J0IHR5cGUgbWFwVmVjdG9yPFQsIFU+ID0gKFxuICB2OiBUIHwgdW5kZWZpbmVkLFxuICBrOiBudW1iZXIsXG4gIHZlY3RvcjogVmVjdG9yPFQ+LFxuKSA9PiBVIHwgdW5kZWZpbmVkO1xuXG4vKipcbiAqIEEgZG91YmxlLWVuZGVkIHF1ZXVlIGltcGxlbWVudGVkIHdpdGggYSBncm93YWJsZSByaW5nIGJ1ZmZlci5cbiAqIFZlY3RvciBpcyBmYXN0ZXIgdGhhbiBKYXZhU2NyaXB0J3MgYnVpbHQgaW4gQXJyYXkgY2xhc3MgZm9yIHNoaWZ0aW5nIGFuZCB1bnNoaWZ0aW5nXG4gKiBiZWNhdXNlIGl0IG9ubHkgcmVxdWlyZXMgcmVhbGxvY2F0aW9uIHdoZW4gaW5jcmVhc2luZyB0aGUgY2FwYWNpdHkuXG4gKi9cbmV4cG9ydCBjbGFzcyBWZWN0b3I8VD4gaW1wbGVtZW50cyBJdGVyYWJsZTxUPiB7XG4gIHByaXZhdGUgZGF0YTogKFQgfCB1bmRlZmluZWQpW107XG4gIHByaXZhdGUgX2NhcGFjaXR5ID0gMDtcbiAgcHJpdmF0ZSBfbGVuZ3RoID0gMDtcbiAgcHJpdmF0ZSBzdGFydCA9IDA7XG4gIHByaXZhdGUgZW5kID0gLTE7XG5cbiAgY29uc3RydWN0b3IoY2FwYWNpdHk6IG51bWJlciA9IDApIHtcbiAgICBpZiAoXG4gICAgICB0eXBlb2YgY2FwYWNpdHkgIT09IFwibnVtYmVyXCIgfHwgTWF0aC5mbG9vcihjYXBhY2l0eSkgIT09IGNhcGFjaXR5XG4gICAgKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiaW52YWxpZCBjYXBhY2l0eVwiKTtcbiAgICB9IGVsc2UgaWYgKGNhcGFjaXR5IDwgMCB8fCBjYXBhY2l0eSA+IG1heENhcGFjaXR5KSB7XG4gICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcihcImludmFsaWQgY2FwYWNpdHlcIik7XG4gICAgfVxuICAgIHRoaXMuX2NhcGFjaXR5ID0gY2FwYWNpdHk7XG4gICAgdGhpcy5kYXRhID0gW107XG4gICAgdGhpcy5kYXRhLmxlbmd0aCA9IGNhcGFjaXR5O1xuICB9XG5cbiAgLyoqIENyZWF0ZXMgYSBuZXcgdmVjdG9yIGZyb20gYW4gYXJyYXkgbGlrZSBvciBpdGVyYWJsZSBvYmplY3QuICovXG4gIHN0YXRpYyBmcm9tPFQsIFUsIFY+KFxuICAgIGNvbGxlY3Rpb246IEFycmF5TGlrZTxUPiB8IEl0ZXJhYmxlPFQ+IHwgVmVjdG9yPFQ+LFxuICApOiBWZWN0b3I8VT47XG4gIHN0YXRpYyBmcm9tPFQsIFUsIFY+KFxuICAgIGNvbGxlY3Rpb246IEFycmF5TGlrZTxUPiB8IEl0ZXJhYmxlPFQ+IHwgVmVjdG9yPFQ+LFxuICAgIG9wdGlvbnM6IHtcbiAgICAgIG1hcDogbWFwPFQsIFU+O1xuICAgICAgdGhpc0FyZz86IFY7XG4gICAgfSxcbiAgKTogVmVjdG9yPFU+O1xuICBzdGF0aWMgZnJvbTxULCBVLCBWPihcbiAgICBjb2xsZWN0aW9uOiBBcnJheUxpa2U8VD4gfCBJdGVyYWJsZTxUPiB8IFZlY3RvcjxUPixcbiAgICBvcHRpb25zPzoge1xuICAgICAgbWFwOiBtYXA8VCwgVT47XG4gICAgICB0aGlzQXJnPzogVjtcbiAgICB9LFxuICApOiBWZWN0b3I8VT4ge1xuICAgIGxldCByZXN1bHQ6IFZlY3RvcjxVPjtcbiAgICBpZiAoY29sbGVjdGlvbiBpbnN0YW5jZW9mIFZlY3Rvcikge1xuICAgICAgaWYgKG9wdGlvbnM/Lm1hcCkge1xuICAgICAgICByZXN1bHQgPSBjb2xsZWN0aW9uLm1hcChvcHRpb25zLm1hcCwgb3B0aW9ucy50aGlzQXJnKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc3VsdCA9IG5ldyBWZWN0b3IoKTtcbiAgICAgICAgcmVzdWx0LmRhdGEgPSBBcnJheS5mcm9tKGNvbGxlY3Rpb24uZGF0YSkgYXMgKFUgfCB1bmRlZmluZWQpW107XG4gICAgICAgIHJlc3VsdC5fY2FwYWNpdHkgPSBjb2xsZWN0aW9uLmNhcGFjaXR5O1xuICAgICAgICByZXN1bHQuX2xlbmd0aCA9IGNvbGxlY3Rpb24ubGVuZ3RoO1xuICAgICAgICByZXN1bHQuc3RhcnQgPSBjb2xsZWN0aW9uLnN0YXJ0O1xuICAgICAgICByZXN1bHQuZW5kID0gY29sbGVjdGlvbi5lbmQ7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlc3VsdCA9IG5ldyBWZWN0b3IoKTtcbiAgICAgIHJlc3VsdC5kYXRhID0gb3B0aW9ucz8ubWFwXG4gICAgICAgID8gQXJyYXkuZnJvbShjb2xsZWN0aW9uLCBvcHRpb25zPy5tYXAsIG9wdGlvbnM/LnRoaXNBcmcpXG4gICAgICAgIDogQXJyYXkuZnJvbShjb2xsZWN0aW9uIGFzIChVIHwgdW5kZWZpbmVkKVtdKTtcbiAgICAgIHJlc3VsdC5fbGVuZ3RoID0gcmVzdWx0LmRhdGEubGVuZ3RoO1xuICAgICAgcmVzdWx0Ll9jYXBhY2l0eSA9IHJlc3VsdC5fbGVuZ3RoO1xuICAgICAgcmVzdWx0LnN0YXJ0ID0gMDtcbiAgICAgIHJlc3VsdC5lbmQgPSByZXN1bHQuX2xlbmd0aCAtIDE7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvKipcbiAgICogVGhlIGFtb3VudCBvZiB2YWx1ZXMgc3RvcmVkIGluIHRoZSB2ZWN0b3IuXG4gICAqIFlvdSBjYW4gc2V0IHRoZSBsZW5ndGggdG8gdHJ1bmNhdGUgdGhlIHZlY3Rvci5cbiAgICogSWYgeW91IGluY3JlYXNlIHRoZSBsZW5ndGggYnkgc2V0dGluZyBpdCwgdGhlIG5ldyBzbG90cyB3aWxsIGJlIGVtcHR5LlxuICAgKi9cbiAgZ2V0IGxlbmd0aCgpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLl9sZW5ndGg7XG4gIH1cbiAgc2V0IGxlbmd0aCh2YWx1ZTogbnVtYmVyKSB7XG4gICAgaWYgKHZhbHVlID09PSAwKSB7XG4gICAgICBpZiAodGhpcy5sZW5ndGggIT09IDApIHRoaXMuZGF0YSA9IFtdO1xuICAgICAgdGhpcy5kYXRhLmxlbmd0aCA9IHRoaXMuY2FwYWNpdHk7XG4gICAgICB0aGlzLnN0YXJ0ID0gMDtcbiAgICAgIHRoaXMuZW5kID0gLTE7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIHR5cGVvZiB2YWx1ZSAhPT0gXCJudW1iZXJcIiB8fCBNYXRoLmZsb29yKHZhbHVlKSAhPT0gdmFsdWVcbiAgICApIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJpbnZhbGlkIGxlbmd0aFwiKTtcbiAgICB9IGVsc2UgaWYgKHZhbHVlIDwgMCB8fCB2YWx1ZSA+IG1heENhcGFjaXR5KSB7XG4gICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcihcImludmFsaWQgbGVuZ3RoXCIpO1xuICAgIH0gZWxzZSBpZiAodmFsdWUgPCB0aGlzLmxlbmd0aCkge1xuICAgICAgY29uc3QgcHJldmlvdXNFbmQ6IG51bWJlciA9IHRoaXMuZW5kO1xuICAgICAgdGhpcy5lbmQgPSAodGhpcy5zdGFydCArIHZhbHVlIC0gMSkgJSB0aGlzLmNhcGFjaXR5O1xuICAgICAgaWYgKHByZXZpb3VzRW5kIDwgdGhpcy5zdGFydCAmJiB0aGlzLmVuZCA+PSB0aGlzLnN0YXJ0KSB7XG4gICAgICAgIHRoaXMuZGF0YS5maWxsKHVuZGVmaW5lZCwgdGhpcy5lbmQgKyAxLCB0aGlzLmNhcGFjaXR5KTtcbiAgICAgICAgdGhpcy5kYXRhLmZpbGwodW5kZWZpbmVkLCAwLCBwcmV2aW91c0VuZCArIDEpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5kYXRhLmZpbGwodW5kZWZpbmVkLCB0aGlzLmVuZCArIDEsIHByZXZpb3VzRW5kICsgMSk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICh2YWx1ZSA+IHRoaXMuY2FwYWNpdHkpIHtcbiAgICAgIHRoaXMuY2FwYWNpdHkgPSB2YWx1ZTtcbiAgICAgIHRoaXMuZW5kID0gKHRoaXMuc3RhcnQgKyB2YWx1ZSAtIDEpICUgdGhpcy5jYXBhY2l0eTtcbiAgICB9IGVsc2UgaWYgKHZhbHVlID4gdGhpcy5sZW5ndGgpIHtcbiAgICAgIHRoaXMuZW5kID0gKHRoaXMuc3RhcnQgKyB2YWx1ZSAtIDEpICUgdGhpcy5jYXBhY2l0eTtcbiAgICB9XG4gICAgdGhpcy5fbGVuZ3RoID0gdmFsdWU7XG4gIH1cblxuICAvKipcbiAgICogVGhlIHZlY3RvciB3aWxsIGJlIGFibGUgdG8gaG9sZCB0aGlzIG1hbnkgdmFsdWVzIHdpdGhvdXQgcmVhbGxvY2F0aW5nLlxuICAgKiBJZiB0aGUgbGVuZ3RoIGV4Y2VlZHMgdGhlIGNhcGFjaXR5LCB0aGVuIHRoZSBjYXBhY2l0eSB3aWxsIGJlIGluY3JlYXNlZC5cbiAgICogQ2hhbmdpbmcgdGhlIGNhcGFjaXR5IG1heSB0cmlnZ2VyIHJlYWxsb2NhdGlvbi5cbiAgICogQ2hhbmdpbmcgdGhlIGNhcGFjaXR5IHRvIGxlc3MgdGhhbiB0aGUgbGVuZ3RoIHdpbGwgY2hhbmdlXG4gICAqIHRoZSBsZW5ndGggdG8gYmUgZXF1YWwgdG8gdGhlIG5ldyBjYXBhY2l0eS5cbiAgICovXG4gIGdldCBjYXBhY2l0eSgpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLl9jYXBhY2l0eTtcbiAgfVxuICBzZXQgY2FwYWNpdHkodmFsdWU6IG51bWJlcikge1xuICAgIGlmICh2YWx1ZSA9PT0gMCkge1xuICAgICAgdGhpcy5fY2FwYWNpdHkgPSAwO1xuICAgICAgdGhpcy5jbGVhcigpO1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICB0eXBlb2YgdmFsdWUgIT09IFwibnVtYmVyXCIgfHwgTWF0aC5mbG9vcih2YWx1ZSkgIT09IHZhbHVlXG4gICAgKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiaW52YWxpZCBjYXBhY2l0eVwiKTtcbiAgICB9IGVsc2UgaWYgKHZhbHVlIDwgMCB8fCB2YWx1ZSA+IG1heENhcGFjaXR5KSB7XG4gICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcihcImludmFsaWQgY2FwYWNpdHlcIik7XG4gICAgfSBlbHNlIGlmICh2YWx1ZSA8IHRoaXMubGVuZ3RoKSB7XG4gICAgICB0aGlzLl9sZW5ndGggPSB2YWx1ZTtcbiAgICAgIHRoaXMuZW5kID0gKHRoaXMuc3RhcnQgKyB2YWx1ZSAtIDEpICUgdGhpcy5jYXBhY2l0eTtcbiAgICAgIHRoaXMuZGF0YSA9IHRoaXMudG9BcnJheSgpO1xuICAgICAgdGhpcy5zdGFydCA9IDA7XG4gICAgICB0aGlzLmVuZCA9IHZhbHVlIC0gMTtcbiAgICB9IGVsc2UgaWYgKHRoaXMuZW5kIDwgdGhpcy5zdGFydCAmJiB2YWx1ZSAhPT0gdGhpcy5jYXBhY2l0eSkge1xuICAgICAgdGhpcy5kYXRhID0gdGhpcy5kYXRhXG4gICAgICAgIC5zbGljZSh0aGlzLnN0YXJ0LCB0aGlzLmNhcGFjaXR5KVxuICAgICAgICAuY29uY2F0KHRoaXMuZGF0YS5zbGljZSgwLCB0aGlzLmVuZCArIDEpKTtcbiAgICAgIHRoaXMuc3RhcnQgPSAwO1xuICAgICAgdGhpcy5lbmQgPSB0aGlzLmxlbmd0aCAtIDE7XG4gICAgfSBlbHNlIGlmICh0aGlzLmVuZCA+PSB2YWx1ZSkge1xuICAgICAgdGhpcy5kYXRhID0gdGhpcy5kYXRhLnNsaWNlKHRoaXMuc3RhcnQsIHRoaXMuZW5kICsgMSk7XG4gICAgICB0aGlzLnN0YXJ0ID0gMDtcbiAgICAgIHRoaXMuZW5kID0gdGhpcy5sZW5ndGggLSAxO1xuICAgIH1cbiAgICB0aGlzLmRhdGEubGVuZ3RoID0gdmFsdWU7XG4gICAgdGhpcy5fY2FwYWNpdHkgPSB2YWx1ZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHRoZSB2YWx1ZSBhdCB0aGUgZ2l2ZW4gaW5kZXguXG4gICAqIElmIHRoZSB2YWx1ZSBpcyBuZWdhdGl2ZSwgaXQgd2lsbCBiZSBzdWJ0cmFjdGVkIGZyb20gdGhlIGVuZC5cbiAgICogVGhlIGluZGV4IDAgd291bGQgcmV0dXJuIHRoZSBmaXJzdCB2YWx1ZSBpbiB0aGUgdmVjdG9yLlxuICAgKiBUaGUgaW5kZXggLTEgd291bGQgcmV0dXJuIHRoZSBsYXN0IHZhbHVlIGluIHRoZSB2ZWN0b3IuXG4gICAqL1xuICBnZXQoaW5kZXg6IG51bWJlcik6IFQgfCB1bmRlZmluZWQge1xuICAgIGlmIChpbmRleCA8IC10aGlzLmxlbmd0aCB8fCBpbmRleCA+PSB0aGlzLmxlbmd0aCkgcmV0dXJuO1xuICAgIGluZGV4ID0gcG9zaXRpdmVJbmRleCh0aGlzLmxlbmd0aCwgaW5kZXgpO1xuICAgIGluZGV4ID0gKHRoaXMuc3RhcnQgKyBpbmRleCkgJSB0aGlzLmNhcGFjaXR5O1xuICAgIHJldHVybiB0aGlzLmRhdGFbaW5kZXhdO1xuICB9XG5cbiAgLyoqXG4gICAqIFNldHMgdGhlIHZhbHVlIGF0IHRoZSBnaXZlbiBpbmRleCwgdGhlbiByZXR1cm5zIHRoZSB2YWx1ZS5cbiAgICogSWYgdGhlIHZhbHVlIGlzIG5lZ2F0aXZlLCBpdCB3aWxsIGJlIHN1YnRyYWN0ZWQgZnJvbSB0aGUgZW5kLlxuICAgKiBUaGUgaW5kZXggMCB3b3VsZCBzZXQgdGhlIGZpcnN0IHZhbHVlIGluIHRoZSB2ZWN0b3IuXG4gICAqIFRoZSBpbmRleCAtMSB3b3VsZCBzZXQgdGhlIGxhc3QgdmFsdWUgaW4gdGhlIHZlY3Rvci5cbiAgICogSWYgdGhlIGFic29sdXRlIGluZGV4IHZhbHVlIGlzIGdyZWF0ZXIgdGhhbiB0aGUgbGVuZ3RoLFxuICAgKiB0aGUgc2l6ZSB3aWxsIGJlIGluY3JlYXNlZCB0byBtYXRjaCBiZWZvcmUgc2V0dGluZyB0aGUgdmFsdWUuXG4gICAqL1xuICBzZXQoaW5kZXg6IG51bWJlciwgdmFsdWU6IFQgfCB1bmRlZmluZWQpIHtcbiAgICBjb25zdCBvZmZzZXQ6IG51bWJlciA9IChpbmRleCA8IDAgPyBNYXRoLmFicyhpbmRleCkgOiAoaW5kZXggKyAxKSkgLVxuICAgICAgdGhpcy5sZW5ndGg7XG4gICAgaWYgKG9mZnNldCA+IDApIHtcbiAgICAgIGNvbnN0IG5ld0xlbmd0aDogbnVtYmVyID0gdGhpcy5sZW5ndGggKyBvZmZzZXQ7XG4gICAgICBsZXQgbmV3Q2FwYWNpdHk6IG51bWJlciA9IHRoaXMuY2FwYWNpdHkgfHwgMTtcbiAgICAgIHdoaWxlIChuZXdDYXBhY2l0eSA8IG5ld0xlbmd0aCkgbmV3Q2FwYWNpdHkgKj0gMjtcbiAgICAgIHRoaXMuY2FwYWNpdHkgPSBuZXdDYXBhY2l0eTtcbiAgICAgIHRoaXMubGVuZ3RoID0gbmV3TGVuZ3RoO1xuICAgIH1cbiAgICBpZiAoaW5kZXggPCAwKSB7XG4gICAgICBpZiAob2Zmc2V0ID4gMCkge1xuICAgICAgICB0aGlzLnN0YXJ0IC09IG9mZnNldDtcbiAgICAgICAgdGhpcy5lbmQgLT0gb2Zmc2V0O1xuICAgICAgICBpZiAodGhpcy5zdGFydCA8IDApIHRoaXMuc3RhcnQgKz0gdGhpcy5jYXBhY2l0eTtcbiAgICAgICAgaWYgKHRoaXMuZW5kIDwgMCkgdGhpcy5lbmQgKz0gdGhpcy5jYXBhY2l0eTtcbiAgICAgIH1cbiAgICAgIGluZGV4ID0gdGhpcy5lbmQgKyBpbmRleCArIDE7XG4gICAgICBpZiAoaW5kZXggPCAwKSBpbmRleCA9IHRoaXMuY2FwYWNpdHkgKyBpbmRleDtcbiAgICB9IGVsc2Uge1xuICAgICAgaW5kZXggPSAodGhpcy5zdGFydCArIGluZGV4KSAlIHRoaXMuY2FwYWNpdHk7XG4gICAgfVxuICAgIHRoaXMuZGF0YVtpbmRleF0gPSB2YWx1ZTtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cblxuICAvKipcbiAgICogUmVtb3ZlcyBhbmQgcmV0dXJucyB0aGUgdmFsdWUgYXQgaW5kZXggZnJvbSB0aGUgdmVjdG9yLlxuICAgKiBJZiB0aGUgdmFsdWUgaXMgbmVnYXRpdmUsIGl0IHdpbGwgYmUgc3VidHJhY3RlZCBmcm9tIHRoZSBlbmQuXG4gICAqIFRoZSB2YWx1ZXMgYmV0d2VlbiB0aGUgaW5kZXggYW5kIHRoZSBlbmQgd2lsbCBiZSBzaGlmdGVkIHRvIHRoZSBsZWZ0LlxuICAgKi9cbiAgZGVsZXRlKGluZGV4OiBudW1iZXIpOiBUIHwgdW5kZWZpbmVkIHtcbiAgICBsZXQgdmFsdWU6IFQgfCB1bmRlZmluZWQ7XG4gICAgaWYgKFxuICAgICAgdGhpcy5sZW5ndGggIT09IDAgJiYgaW5kZXggPCB0aGlzLmxlbmd0aCAmJiBpbmRleCA+PSAtdGhpcy5sZW5ndGhcbiAgICApIHtcbiAgICAgIHZhbHVlID0gdGhpcy5zcGxpY2UoaW5kZXgsIDEpLmdldCgwKTtcbiAgICB9XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG5cbiAgLyoqIFNocmlua3MgdGhlIGNhcGFjaXR5IHRvIGJlIGVxdWFsIHRvIHRoZSBsZW5ndGguICovXG4gIHNocmlua1RvRml0KCk6IHZvaWQge1xuICAgIHRoaXMuY2FwYWNpdHkgPSB0aGlzLmxlbmd0aDtcbiAgfVxuXG4gIC8qKiBSZXR1cm5zIHRoZSBmaXJzdCB2YWx1ZSBpbiB0aGUgdmVjdG9yLCBvciB1bmRlZmluZWQgaWYgaXQgaXMgZW1wdHkuICovXG4gIHBlZWsoKTogVCB8IHVuZGVmaW5lZCB7XG4gICAgcmV0dXJuIHRoaXMuZGF0YVt0aGlzLnN0YXJ0XTtcbiAgfVxuXG4gIC8qKiBSZW1vdmVzIHRoZSBmaXJzdCB2YWx1ZSBmcm9tIHRoZSB2ZWN0b3IgYW5kIHJldHVybnMgaXQsIG9yIHVuZGVmaW5lZCBpZiBpdCBpcyBlbXB0eS4gKi9cbiAgc2hpZnQoKTogVCB8IHVuZGVmaW5lZCB7XG4gICAgY29uc3QgcmVzdWx0ID0gdGhpcy5kYXRhW3RoaXMuc3RhcnRdO1xuICAgIGlmICh0aGlzLmxlbmd0aCA+IDApIHtcbiAgICAgIHRoaXMuZGF0YVt0aGlzLnN0YXJ0XSA9IHVuZGVmaW5lZDtcbiAgICAgIHRoaXMuX2xlbmd0aC0tO1xuICAgICAgdGhpcy5zdGFydCA9IHRoaXMuc3RhcnQgPT09IHRoaXMuY2FwYWNpdHlcbiAgICAgICAgPyAwXG4gICAgICAgIDogKCh0aGlzLnN0YXJ0ICsgMSkgJSB0aGlzLmNhcGFjaXR5KTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKiBBZGRzIHZhbHVlcyB0byB0aGUgc3RhcnQgb2YgdGhlIHZlY3Rvci4gKi9cbiAgdW5zaGlmdCguLi52YWx1ZXM6IFRbXSk6IG51bWJlciB7XG4gICAgY29uc3QgbmV3TGVuZ3RoOiBudW1iZXIgPSB0aGlzLmxlbmd0aCArIHZhbHVlcy5sZW5ndGg7XG4gICAgbGV0IG5ld0NhcGFjaXR5OiBudW1iZXIgPSB0aGlzLmNhcGFjaXR5IHx8IDE7XG4gICAgd2hpbGUgKG5ld0NhcGFjaXR5IDwgbmV3TGVuZ3RoKSBuZXdDYXBhY2l0eSAqPSAyO1xuICAgIHRoaXMuY2FwYWNpdHkgPSBuZXdDYXBhY2l0eTtcbiAgICB0aGlzLmxlbmd0aCA9IG5ld0xlbmd0aDtcbiAgICB0aGlzLnN0YXJ0ID0gdmFsdWVzLmxlbmd0aCA8IHRoaXMuc3RhcnRcbiAgICAgID8gKHRoaXMuc3RhcnQgLSB2YWx1ZXMubGVuZ3RoKVxuICAgICAgOiAodGhpcy5jYXBhY2l0eSAtIHZhbHVlcy5sZW5ndGggKyB0aGlzLnN0YXJ0KTtcbiAgICB0aGlzLmVuZCA9ICh0aGlzLnN0YXJ0ICsgdGhpcy5sZW5ndGggLSAxKSAlIHRoaXMuY2FwYWNpdHk7XG4gICAgbGV0IGluZGV4OiBudW1iZXIgPSB0aGlzLnN0YXJ0O1xuICAgIGZvciAoY29uc3QgdmFsdWUgb2YgdmFsdWVzKSB7XG4gICAgICB0aGlzLmRhdGFbaW5kZXgrKyAlIHRoaXMuY2FwYWNpdHldID0gdmFsdWU7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmxlbmd0aDtcbiAgfVxuXG4gIC8qKiBSZXR1cm5zIHRoZSBsYXN0IHZhbHVlIGluIHRoZSB2ZWN0b3IsIG9yIHVuZGVmaW5lZCBpZiBpdCBpcyBlbXB0eS4gKi9cbiAgcGVla1JpZ2h0KCk6IFQgfCB1bmRlZmluZWQge1xuICAgIHJldHVybiB0aGlzLmRhdGFbdGhpcy5lbmRdO1xuICB9XG5cbiAgLyoqIFJlbW92ZXMgdGhlIGxhc3QgdmFsdWUgZnJvbSB0aGUgdmVjdG9yIGFuZCByZXR1cm5zIGl0LCBvciB1bmRlZmluZWQgaWYgaXQgaXMgZW1wdHkuICovXG4gIHBvcCgpOiBUIHwgdW5kZWZpbmVkIHtcbiAgICBjb25zdCByZXN1bHQgPSB0aGlzLmRhdGFbdGhpcy5lbmRdO1xuICAgIGlmICh0aGlzLmxlbmd0aCA+IDApIHtcbiAgICAgIHRoaXMuZGF0YVt0aGlzLmVuZF0gPSB1bmRlZmluZWQ7XG4gICAgICB0aGlzLl9sZW5ndGgtLTtcbiAgICAgIHRoaXMuZW5kID0gKHRoaXMuZW5kIHx8IHRoaXMuY2FwYWNpdHkpIC0gMTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKiBBZGRzIHZhbHVlcyB0byB0aGUgZW5kIG9mIHRoZSB2ZWN0b3IuICovXG4gIHB1c2goLi4udmFsdWVzOiBUW10pOiBudW1iZXIge1xuICAgIGNvbnN0IG9sZExlbmd0aDogbnVtYmVyID0gdGhpcy5sZW5ndGg7XG4gICAgY29uc3QgbmV3TGVuZ3RoOiBudW1iZXIgPSBvbGRMZW5ndGggKyB2YWx1ZXMubGVuZ3RoO1xuICAgIGxldCBuZXdDYXBhY2l0eTogbnVtYmVyID0gdGhpcy5jYXBhY2l0eSB8fCAxO1xuICAgIHdoaWxlIChuZXdDYXBhY2l0eSA8IG5ld0xlbmd0aCkgbmV3Q2FwYWNpdHkgKj0gMjtcbiAgICB0aGlzLmNhcGFjaXR5ID0gbmV3Q2FwYWNpdHk7XG4gICAgdGhpcy5sZW5ndGggPSBuZXdMZW5ndGg7XG4gICAgbGV0IGluZGV4OiBudW1iZXIgPSAodGhpcy5zdGFydCArIG9sZExlbmd0aCkgJSB0aGlzLmNhcGFjaXR5O1xuICAgIGZvciAoY29uc3QgdmFsdWUgb2YgdmFsdWVzKSB7XG4gICAgICB0aGlzLmRhdGFbaW5kZXgrKyAlIHRoaXMuY2FwYWNpdHldID0gdmFsdWU7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmxlbmd0aDtcbiAgfVxuXG4gIC8qKlxuICAgKiBBcHBsaWVzIGEgZnVuY3Rpb24gYWdhaW5zdCBhbiBhY2N1bXVsYXRvciBhbmQgZWFjaCB2YWx1ZSBvZiB0aGUgdmVjdG9yIChmcm9tIGxlZnQtdG8tcmlnaHQpIHRvIHJlZHVjZSBpdCB0byBhIHNpbmdsZSB2YWx1ZS5cbiAgICogSWYgbm8gaW5pdGlhbCB2YWx1ZSBpcyBzdXBwbGllZCwgdGhlIGZpcnN0IHZhbHVlIGluIHRoZSB2ZWN0b3Igd2lsbCBiZSB1c2VkIGFuZCBza2lwcGVkLlxuICAgKiBDYWxsaW5nIHJlZHVjZSBvbiBhbiBlbXB0eSBhcnJheSB3aXRob3V0IGFuIGluaXRpYWwgdmFsdWUgY3JlYXRlcyBhIFR5cGVFcnJvci5cbiAgICovXG4gIHJlZHVjZTxVPihcbiAgICBjYWxsYmFjazogKHByZXZpb3VzVmFsdWU6IFUsIGN1cnJlbnRWYWx1ZTogVCwgY3VycmVudEluZGV4OiBudW1iZXIpID0+IFUsXG4gICAgaW5pdGlhbFZhbHVlPzogVSxcbiAgKTogVSB7XG4gICAgcmV0dXJuIHJlZHVjZSh0aGlzLnZhbHVlcygpLCB0aGlzLmxlbmd0aCwgMSwgY2FsbGJhY2ssIGluaXRpYWxWYWx1ZSk7XG4gIH1cblxuICAvKipcbiAgICogQXBwbGllcyBhIGZ1bmN0aW9uIGFnYWluc3QgYW4gYWNjdW11bGF0b3IgYW5kIGVhY2ggdmFsdWUgb2YgdGhlIHZlY3RvciAoZnJvbSByaWdodC10by1sZWZ0KSB0byByZWR1Y2UgaXQgdG8gYSBzaW5nbGUgdmFsdWUuXG4gICAqIElmIG5vIGluaXRpYWwgdmFsdWUgaXMgc3VwcGxpZWQsIHRoZSBsYXN0IHZhbHVlIGluIHRoZSB2ZWN0b3Igd2lsbCBiZSB1c2VkIGFuZCBza2lwcGVkLlxuICAgKiBDYWxsaW5nIHJlZHVjZSBvbiBhbiBlbXB0eSBhcnJheSB3aXRob3V0IGFuIGluaXRpYWwgdmFsdWUgY3JlYXRlcyBhIFR5cGVFcnJvci5cbiAgICovXG4gIHJlZHVjZVJpZ2h0PFU+KFxuICAgIGNhbGxiYWNrOiAocHJldmlvdXNWYWx1ZTogVSwgY3VycmVudFZhbHVlOiBULCBjdXJyZW50SW5kZXg6IG51bWJlcikgPT4gVSxcbiAgICBpbml0aWFsVmFsdWU/OiBVLFxuICApOiBVIHtcbiAgICByZXR1cm4gcmVkdWNlKHRoaXMudmFsdWVzUmlnaHQoKSwgdGhpcy5sZW5ndGgsIC0xLCBjYWxsYmFjaywgaW5pdGlhbFZhbHVlKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGVzIGFuZCByZXR1cm5zIGEgbmV3IHN0cmluZyBjb25jYXRlbmF0aW5nIGFsbCBvZiB0aGUgdmFsdWVzIGluIHRoZSBWZWN0b3IsXG4gICAqIGNvbnZlcnRlZCB0byBzdHJpbmdzIHVzaW5nIHRoZWlyIHRvU3RyaW5nIG1ldGhvZHMgYW5kXG4gICAqIHNlcGFyYXRlZCBieSBjb21tYXMgb3IgYSBzcGVjaWZpZWQgc2VwYXJhdG9yIHN0cmluZy5cbiAgICovXG4gIGpvaW4oc2VwYXJhdG9yID0gXCIsXCIpOiBzdHJpbmcge1xuICAgIGNvbnN0IGl0ZXJhdG9yOiBJdGVyYWJsZUl0ZXJhdG9yPFQ+ID0gdGhpcy52YWx1ZXMoKTtcbiAgICBsZXQgcmVzdWx0ID0gXCJcIjtcbiAgICBsZXQgc3RhcnRlZCA9IGZhbHNlO1xuICAgIGZvciAoY29uc3QgdmFsdWUgb2YgaXRlcmF0b3IpIHtcbiAgICAgIGlmIChzdGFydGVkKSByZXN1bHQgKz0gc2VwYXJhdG9yO1xuICAgICAgcmVzdWx0ICs9ICh2YWx1ZSBhcyB1bmtub3duIGFzIHN0cmluZyk/LnRvU3RyaW5nKCkgPz8gXCJcIjtcbiAgICAgIGlmICghc3RhcnRlZCkgc3RhcnRlZCA9IHRydWU7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlcyBhbmQgcmV0dXJucyBhIG5ldyBzdHJpbmcgY29uY2F0ZW5hdGluZyBhbGwgb2YgdGhlIHZhbHVlcyBpbiB0aGUgVmVjdG9yLFxuICAgKiBjb252ZXJ0ZWQgdG8gc3RyaW5ncyB1c2luZyB0aGVpciB0b1N0cmluZyBtZXRob2RzIGFuZCBzZXBhcmF0ZWQgYnkgY29tbWFzLlxuICAgKi9cbiAgdG9TdHJpbmcoKTogc3RyaW5nIHtcbiAgICByZXR1cm4gdGhpcy5qb2luKCk7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlcyBhbmQgcmV0dXJucyBhIG5ldyBzdHJpbmcgY29uY2F0ZW5hdGluZyBhbGwgb2YgdGhlIHZhbHVlcyBpbiB0aGUgVmVjdG9yLFxuICAgKiBjb252ZXJ0ZWQgdG8gc3RyaW5ncyB1c2luZyB0aGVpciB0b0xvY2FsZVN0cmluZyBtZXRob2RzIGFuZFxuICAgKiBzZXBhcmF0ZWQgYnkgYSBsb2NhbGUtc3BlY2lmaWMgc3RyaW5nLlxuICAgKi9cbiAgdG9Mb2NhbGVTdHJpbmcoKTogc3RyaW5nIHtcbiAgICByZXR1cm4gdGhpcy50b0FycmF5KCkudG9Mb2NhbGVTdHJpbmcoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIGEgc2hhbGxvdyBjb3B5IG9mIGEgcG9ydGlvbiBvZiB0aGUgdmVjdG9yIGludG8gYSBuZXcgdmVjdG9yLlxuICAgKiBUaGUgc3RhcnQgYW5kIGVuZCByZXByZXNlbnQgdGhlIGluZGV4IG9mIHZhbHVlcyBpbiB0aGUgdmVjdG9yLlxuICAgKiBUaGUgZW5kIGlzIGV4Y2x1c2l2ZSBtZWFuaW5nIGl0IHdpbGwgbm90IGJlIGluY2x1ZGVkLlxuICAgKiBJZiB0aGUgaW5kZXggdmFsdWUgaXMgbmVnYXRpdmUsIGl0IHdpbGwgYmUgc3VidHJhY3RlZCBmcm9tIHRoZSBlbmQgb2YgdGhlIHZlY3Rvci5cbiAgICogRm9yIGV4YW1wbGUsIGB2ZWN0b3Iuc2xpY2UoLTIpYCB3b3VsZCByZXR1cm4gYSBuZXcgdmVjdG9yXG4gICAqIGNvbnRhaW5pbmcgdGhlIGxhc3QgMiB2YWx1ZXMuXG4gICAqL1xuICBzbGljZShzdGFydCA9IDAsIGVuZD86IG51bWJlcik6IFZlY3RvcjxUPiB7XG4gICAgY29uc3QgdmVjdG9yOiBWZWN0b3I8VD4gPSBuZXcgVmVjdG9yKCk7XG5cbiAgICBzdGFydCA9IHBvc2l0aXZlSW5kZXgodGhpcy5sZW5ndGgsIHN0YXJ0KTtcbiAgICBlbmQgPSBwb3NpdGl2ZUluZGV4KHRoaXMubGVuZ3RoLCBlbmQgPz8gdGhpcy5sZW5ndGgpO1xuICAgIGlmIChzdGFydCA+PSBlbmQpIHJldHVybiB2ZWN0b3I7XG4gICAgc3RhcnQgPSAodGhpcy5zdGFydCArIHN0YXJ0KSAlIHRoaXMuY2FwYWNpdHk7XG4gICAgZW5kID0gKHRoaXMuc3RhcnQgKyBlbmQpICUgdGhpcy5jYXBhY2l0eTtcblxuICAgIHZlY3Rvci5kYXRhID0gKGVuZCA+IHN0YXJ0ID8gdGhpcy5kYXRhLnNsaWNlKHN0YXJ0LCBlbmQpIDogKHRoaXMuZGF0YVxuICAgICAgLnNsaWNlKHN0YXJ0LCB0aGlzLmNhcGFjaXR5KVxuICAgICAgLmNvbmNhdCh0aGlzLmRhdGEuc2xpY2UoMCwgZW5kKSkpKSBhcyBUW107XG4gICAgdmVjdG9yLl9sZW5ndGggPSB2ZWN0b3IuZGF0YS5sZW5ndGg7XG4gICAgdmVjdG9yLl9jYXBhY2l0eSA9IHZlY3Rvci5fbGVuZ3RoO1xuICAgIHZlY3Rvci5lbmQgPSB2ZWN0b3IuX2xlbmd0aCAtIDE7XG4gICAgcmV0dXJuIHZlY3RvcjtcbiAgfVxuXG4gIC8qKlxuICAgKiBDaGFuZ2VzIHRoZSBjb250ZW50cyBvZiBhbiBhcnJheSBpbiBwbGFjZSBieSByZW1vdmluZyBvciByZXBsYWNpbmcgZXhpc3RpbmcgZWxlbWVudHNcbiAgICogb3IgaW5zZXJ0aW5nIG5ldyB2YWx1ZXMuIFRoZW4gcmV0dXJucyBhbiBWZWN0b3Igb2YgdGhlIHZhbHVlcyB0aGF0IHdlcmUgcmVtb3ZlZC5cbiAgICogUmV0dXJucyBhIHNoYWxsb3cgY29weSBvZiBhIHBvcnRpb24gb2YgdGhlIHZlY3RvciBpbnRvIGEgbmV3IHZlY3Rvci5cbiAgICogVGhlIHN0YXJ0IHJlcHJlc2VudHMgdGhlIGluZGV4IG9mIHZhbHVlIHlvdSBtYXkgaW5zZXJ0IHZhbHVlcyBiZWZvcmVcbiAgICogb3IgZGVsZXRlIHZhbHVlcyBzdGFydGluZyBmcm9tLlxuICAgKiBUaGUgZGVsZXRlQ291bnQgaXMgdGhlIG51bWJlciBvZiB2YWx1ZXMgeW91IHdvdWxkIGxpa2UgdG8gZGVsZXRlIGZyb20gdGhlIHZlY3Rvci5cbiAgICogVGhlIGRlbGV0ZUNvdW50IHdvdWxkIGRlZmF1bHQgdG8gdGhlIG51bWJlciBvZiB2YWx1ZXMgYmV0d2VlbiB0aGUgaW5kZXggYW5kIHRoZSBlbmQgb2YgdGhlIHZlY3Rvci5cbiAgICogSWYgdGhlIHN0YXJ0IHZhbHVlIGlzIG5lZ2F0aXZlLCBpdCB3aWxsIGJlIHN1YnRyYWN0ZWQgZnJvbSB0aGUgZW5kIG9mIHRoZSB2ZWN0b3IuXG4gICAqIElmIHRoZSBkZWxldGVDb3VudCBpcyBsZXNzIHRoYW4gMCwgbm8gdmFsdWVzIHdpbGwgYmUgZGVsZXRlZC5cbiAgICogSWYgYW55IGluc2VydCB2YWx1ZXMgYXJlIHNwZWNpZmllZCwgdGhleSB3aWxsIGJlIGluc2VydGVkIGJlZm9yZSB0aGUgc3RhcnQgaW5kZXguXG4gICAqL1xuICBzcGxpY2Uoc3RhcnQ6IG51bWJlciwgZGVsZXRlQ291bnQ/OiBudW1iZXIpOiBWZWN0b3I8VD47XG4gIHNwbGljZShcbiAgICBzdGFydDogbnVtYmVyLFxuICAgIGRlbGV0ZUNvdW50OiBudW1iZXIsXG4gICAgLi4uaW5zZXJ0VmFsdWVzOiAoVCB8IHVuZGVmaW5lZClbXVxuICApOiBWZWN0b3I8VD47XG4gIHNwbGljZShcbiAgICBzdGFydDogbnVtYmVyLFxuICAgIGRlbGV0ZUNvdW50PzogbnVtYmVyLFxuICAgIC4uLmluc2VydFZhbHVlczogKFQgfCB1bmRlZmluZWQpW11cbiAgKTogVmVjdG9yPFQ+IHtcbiAgICBzdGFydCA9IHBvc2l0aXZlSW5kZXgodGhpcy5sZW5ndGgsIHN0YXJ0KTtcbiAgICBkZWxldGVDb3VudCA9IGRlbGV0ZUNvdW50ID8/ICh0aGlzLmxlbmd0aCAtIHN0YXJ0KTtcbiAgICBpZiAoZGVsZXRlQ291bnQgPCAwKSBkZWxldGVDb3VudCA9IDA7XG4gICAgbGV0IGVuZDogbnVtYmVyID0gc3RhcnQgKyBkZWxldGVDb3VudDtcbiAgICBpZiAoZW5kID4gdGhpcy5sZW5ndGgpIGVuZCA9IHRoaXMubGVuZ3RoO1xuICAgIGNvbnN0IHJlbW92ZWQ6IFZlY3RvcjxUPiA9IHRoaXMuc2xpY2Uoc3RhcnQsIGVuZCk7XG4gICAgbGV0IG9mZnNldCA9IHN0YXJ0IC0gZW5kICsgaW5zZXJ0VmFsdWVzLmxlbmd0aDtcbiAgICBjb25zdCBiZWZvcmUgPSBzdGFydDtcbiAgICBjb25zdCBhZnRlciA9IHRoaXMubGVuZ3RoIC0gZW5kO1xuICAgIGlmIChvZmZzZXQpIHtcbiAgICAgIGlmIChvZmZzZXQgPiAwKSB7XG4gICAgICAgIHRoaXMubGVuZ3RoICs9IG9mZnNldDtcbiAgICAgICAgaWYgKGJlZm9yZSA8IGFmdGVyKSB7XG4gICAgICAgICAgdGhpcy5zdGFydCAtPSBvZmZzZXQ7XG4gICAgICAgICAgdGhpcy5lbmQgLT0gb2Zmc2V0O1xuICAgICAgICAgIGlmICh0aGlzLnN0YXJ0IDwgMCkgdGhpcy5zdGFydCArPSB0aGlzLmNhcGFjaXR5O1xuICAgICAgICAgIGlmICh0aGlzLmVuZCA8IDApIHRoaXMuZW5kICs9IHRoaXMuY2FwYWNpdHk7XG4gICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBiZWZvcmU7IGkrKykge1xuICAgICAgICAgICAgdGhpcy5zZXQoaSwgdGhpcy5nZXQoaSArIG9mZnNldCkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8PSBhZnRlcjsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBpbmRleCA9IHRoaXMubGVuZ3RoIC0gaTtcbiAgICAgICAgICAgIHRoaXMuc2V0KGluZGV4LCB0aGlzLmdldChpbmRleCAtIG9mZnNldCkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgb2Zmc2V0ICo9IC0xO1xuICAgICAgICBpZiAoYmVmb3JlIDwgYWZ0ZXIpIHtcbiAgICAgICAgICBzdGFydCArPSBvZmZzZXQ7XG4gICAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPD0gYmVmb3JlOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGluZGV4ID0gc3RhcnQgLSBpO1xuICAgICAgICAgICAgdGhpcy5zZXQoaW5kZXgsIHRoaXMuZ2V0KGluZGV4IC0gb2Zmc2V0KSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRoaXMuc3RhcnQgKz0gb2Zmc2V0O1xuICAgICAgICAgIHRoaXMuZW5kICs9IG9mZnNldDtcbiAgICAgICAgICBpZiAodGhpcy5zdGFydCA8IDApIHRoaXMuc3RhcnQgKz0gdGhpcy5jYXBhY2l0eTtcbiAgICAgICAgICBpZiAodGhpcy5lbmQgPCAwKSB0aGlzLmVuZCArPSB0aGlzLmNhcGFjaXR5O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGVuZCAtPSBvZmZzZXQ7XG4gICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhZnRlcjsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBpbmRleCA9IGVuZCArIGk7XG4gICAgICAgICAgICB0aGlzLnNldChpbmRleCwgdGhpcy5nZXQoaW5kZXggKyBvZmZzZXQpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5sZW5ndGggLT0gb2Zmc2V0O1xuICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGluc2VydFZhbHVlcy5sZW5ndGg7IGkrKykge1xuICAgICAgdGhpcy5zZXQoc3RhcnQgKyBpLCBpbnNlcnRWYWx1ZXNbaV0pO1xuICAgIH1cbiAgICByZXR1cm4gcmVtb3ZlZDtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXZlcnNlcyB0aGUgdmVjdG9yIGluIHBsYWNlIHRoZW4gcmV0dXJucyBpdC5cbiAgICovXG4gIHJldmVyc2UoKTogVmVjdG9yPFQ+IHtcbiAgICBjb25zdCBtaWQ6IG51bWJlciA9IE1hdGguZmxvb3IodGhpcy5sZW5ndGggLyAyKTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1pZDsgaSsrKSB7XG4gICAgICBjb25zdCB0ZW1wOiBUIHwgdW5kZWZpbmVkID0gdGhpcy5nZXQoaSk7XG4gICAgICBjb25zdCBqOiBudW1iZXIgPSB0aGlzLmxlbmd0aCAtIGkgLSAxO1xuICAgICAgdGhpcy5zZXQoaSwgdGhpcy5nZXQoaikpO1xuICAgICAgdGhpcy5zZXQoaiwgdGVtcCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLyoqXG4gICAqIEV4ZWN1dGVzIHRoZSBwcm92aWRlZCBmdW5jdGlvbiBvbmNlIGZvciBlYWNoIHZhbHVlIGluIHRoZSB2ZWN0b3IuXG4gICAqIE9wdGlvbmFsbHksIHlvdSBjYW4gaXRlcmF0ZSBhIHN1YnNldCBvZiB0aGUgdmVjdG9yIGJ5IHByb3ZpZGluZyBhbiBpbmRleCByYW5nZS5cbiAgICogVGhlIHN0YXJ0IGFuZCBlbmQgcmVwcmVzZW50IHRoZSBpbmRleCBvZiB2YWx1ZXMgaW4gdGhlIHZlY3Rvci5cbiAgICogVGhlIGVuZCBpcyBleGNsdXNpdmUgbWVhbmluZyBpdCB3aWxsIG5vdCBiZSBpbmNsdWRlZC5cbiAgICogSWYgdGhlIGluZGV4IHZhbHVlIGlzIG5lZ2F0aXZlLCBpdCB3aWxsIGJlIHN1YnRyYWN0ZWQgZnJvbSB0aGUgZW5kIG9mIHRoZSB2ZWN0b3IuXG4gICAqL1xuICBmb3JFYWNoKFxuICAgIGNhbGxiYWNrOiAodmFsdWU6IFQgfCB1bmRlZmluZWQsIGluZGV4OiBudW1iZXIsIHZlY3RvcjogVmVjdG9yPFQ+KSA9PiB2b2lkLFxuICAgIHN0YXJ0PzogbnVtYmVyLFxuICAgIGVuZD86IG51bWJlcixcbiAgKTogdm9pZDtcbiAgZm9yRWFjaDxVPihcbiAgICBjYWxsYmFjazogKHZhbHVlOiBUIHwgdW5kZWZpbmVkLCBpbmRleDogbnVtYmVyLCB2ZWN0b3I6IFZlY3RvcjxUPikgPT4gdm9pZCxcbiAgICB0aGlzQXJnPzogVSxcbiAgICBzdGFydD86IG51bWJlcixcbiAgICBlbmQ/OiBudW1iZXIsXG4gICk6IHZvaWQ7XG4gIGZvckVhY2g8VT4oXG4gICAgY2FsbGJhY2s6ICh2YWx1ZTogVCB8IHVuZGVmaW5lZCwgaW5kZXg6IG51bWJlciwgdmVjdG9yOiBWZWN0b3I8VD4pID0+IHZvaWQsXG4gICAgdGhpc0FyZz86IFUsXG4gICAgc3RhcnQ/OiBudW1iZXIsXG4gICAgZW5kPzogbnVtYmVyLFxuICApOiB2b2lkIHtcbiAgICBpZiAodHlwZW9mIHRoaXNBcmcgPT09IFwibnVtYmVyXCIpIHtcbiAgICAgIGVuZCA9IHN0YXJ0O1xuICAgICAgc3RhcnQgPSB0aGlzQXJnO1xuICAgICAgdGhpc0FyZyA9IHVuZGVmaW5lZDtcbiAgICB9XG4gICAgc3RhcnQgPSBwb3NpdGl2ZUluZGV4KHRoaXMubGVuZ3RoLCBzdGFydCA/PyAwKTtcbiAgICBlbmQgPSBwb3NpdGl2ZUluZGV4KHRoaXMubGVuZ3RoLCBlbmQgPz8gdGhpcy5sZW5ndGgpO1xuICAgIGZvciAobGV0IGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgICBjYWxsYmFjay5jYWxsKHRoaXNBcmcsIHRoaXMuZ2V0KGkpISwgaSwgdGhpcyk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZXMgYSBuZXcgdmVjdG9yIGZyb20gdGhlIHJlc3VsdHMgb2YgZXhlY3V0aW5nIHRoZSBwcm92aWRlZCBmdW5jdGlvblxuICAgKiBmb3IgZWFjaCB2YWx1ZSBpbiB0aGUgdmVjdG9yLlxuICAgKiBPcHRpb25hbGx5LCB5b3UgY2FuIGl0ZXJhdGUgYSBzdWJzZXQgb2YgdGhlIHZlY3RvciBieSBwcm92aWRpbmcgYW4gaW5kZXggcmFuZ2UuXG4gICAqIFRoZSBzdGFydCBhbmQgZW5kIHJlcHJlc2VudCB0aGUgaW5kZXggb2YgdmFsdWVzIGluIHRoZSB2ZWN0b3IuXG4gICAqIFRoZSBlbmQgaXMgZXhjbHVzaXZlIG1lYW5pbmcgaXQgd2lsbCBub3QgYmUgaW5jbHVkZWQuXG4gICAqIElmIHRoZSBpbmRleCB2YWx1ZSBpcyBuZWdhdGl2ZSwgaXQgd2lsbCBiZSBzdWJ0cmFjdGVkIGZyb20gdGhlIGVuZCBvZiB0aGUgdmVjdG9yLlxuICAgKi9cbiAgbWFwPFU+KFxuICAgIGNhbGxiYWNrOiBtYXBWZWN0b3I8VCwgVT4sXG4gICAgc3RhcnQ/OiBudW1iZXIsXG4gICAgZW5kPzogbnVtYmVyLFxuICApOiBWZWN0b3I8VT47XG4gIG1hcDxVLCBWPihcbiAgICBjYWxsYmFjazogbWFwVmVjdG9yPFQsIFU+LFxuICAgIHRoaXNBcmc/OiBWLFxuICAgIHN0YXJ0PzogbnVtYmVyLFxuICAgIGVuZD86IG51bWJlcixcbiAgKTogVmVjdG9yPFU+O1xuICBtYXA8VSwgVj4oXG4gICAgY2FsbGJhY2s6IG1hcFZlY3RvcjxULCBVPixcbiAgICB0aGlzQXJnPzogVixcbiAgICBzdGFydD86IG51bWJlcixcbiAgICBlbmQ/OiBudW1iZXIsXG4gICk6IFZlY3RvcjxVPiB7XG4gICAgaWYgKHR5cGVvZiB0aGlzQXJnID09PSBcIm51bWJlclwiKSB7XG4gICAgICBlbmQgPSBzdGFydDtcbiAgICAgIHN0YXJ0ID0gdGhpc0FyZztcbiAgICAgIHRoaXNBcmcgPSB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHN0YXJ0ID0gcG9zaXRpdmVJbmRleCh0aGlzLmxlbmd0aCwgc3RhcnQgPz8gMCk7XG4gICAgZW5kID0gcG9zaXRpdmVJbmRleCh0aGlzLmxlbmd0aCwgZW5kID8/IHRoaXMubGVuZ3RoKTtcbiAgICBjb25zdCByZXN1bHQ6IFZlY3RvcjxVPiA9XG4gICAgICAoc3RhcnQgPT09IDAgJiYgZW5kID09PSB0aGlzLmxlbmd0aFxuICAgICAgICA/IFZlY3Rvci5mcm9tKHRoaXMpXG4gICAgICAgIDogdGhpcy5zbGljZShzdGFydCwgZW5kKSkgYXMgVmVjdG9yPFU+O1xuICAgIGNvbnN0IG9mZnNldDogbnVtYmVyID0gc3RhcnQ7XG4gICAgc3RhcnQgPSAwO1xuICAgIGVuZCA9IHJlc3VsdC5sZW5ndGg7XG4gICAgZm9yIChsZXQgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICAgIHJlc3VsdC5zZXQoXG4gICAgICAgIGksXG4gICAgICAgIGNhbGxiYWNrLmNhbGwodGhpc0FyZywgdGhpcy5nZXQoaSArIG9mZnNldCksIGkgKyBvZmZzZXQsIHRoaXMpLFxuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHRoZSBpbmRleCBvZiB0aGUgZmlyc3QgdmFsdWUgaW4gdGhlIHZlY3RvciB0aGF0IHNhdGlzZmllcyB0aGVcbiAgICogcHJvdmlkZWQgdGVzdGluZyBmdW5jdGlvbiBvciAxIGlmIGl0IGlzIG5vdCBmb3VuZC5cbiAgICogT3B0aW9uYWxseSwgeW91IGNhbiBzZWFyY2ggYSBzdWJzZXQgb2YgdGhlIHZlY3RvciBieSBwcm92aWRpbmcgYW4gaW5kZXggcmFuZ2UuXG4gICAqIFRoZSBzdGFydCBhbmQgZW5kIHJlcHJlc2VudCB0aGUgaW5kZXggb2YgdmFsdWVzIGluIHRoZSB2ZWN0b3IuXG4gICAqIFRoZSBlbmQgaXMgZXhjbHVzaXZlIG1lYW5pbmcgaXQgd2lsbCBub3QgYmUgaW5jbHVkZWQuXG4gICAqIElmIHRoZSBpbmRleCB2YWx1ZSBpcyBuZWdhdGl2ZSwgaXQgd2lsbCBiZSBzdWJ0cmFjdGVkIGZyb20gdGhlIGVuZCBvZiB0aGUgdmVjdG9yLlxuICAgKi9cbiAgZmluZEluZGV4KFxuICAgIGNhbGxiYWNrOiAodmFsdWU6IFQsIGluZGV4OiBudW1iZXIsIHZlY3RvcjogVmVjdG9yPFQ+KSA9PiB1bmtub3duLFxuICAgIHN0YXJ0PzogbnVtYmVyLFxuICAgIGVuZD86IG51bWJlcixcbiAgKTogbnVtYmVyO1xuICBmaW5kSW5kZXg8VT4oXG4gICAgY2FsbGJhY2s6ICh2YWx1ZTogVCwgaW5kZXg6IG51bWJlciwgdmVjdG9yOiBWZWN0b3I8VD4pID0+IHVua25vd24sXG4gICAgdGhpc0FyZz86IFUsXG4gICAgc3RhcnQ/OiBudW1iZXIsXG4gICAgZW5kPzogbnVtYmVyLFxuICApOiBudW1iZXI7XG4gIGZpbmRJbmRleDxVPihcbiAgICBjYWxsYmFjazogKHZhbHVlOiBULCBpbmRleDogbnVtYmVyLCB2ZWN0b3I6IFZlY3RvcjxUPikgPT4gdW5rbm93bixcbiAgICB0aGlzQXJnPzogVSxcbiAgICBzdGFydD86IG51bWJlcixcbiAgICBlbmQ/OiBudW1iZXIsXG4gICk6IG51bWJlciB7XG4gICAgaWYgKHR5cGVvZiB0aGlzQXJnID09PSBcIm51bWJlclwiKSB7XG4gICAgICBlbmQgPSBzdGFydDtcbiAgICAgIHN0YXJ0ID0gdGhpc0FyZztcbiAgICAgIHRoaXNBcmcgPSB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHN0YXJ0ID0gcG9zaXRpdmVJbmRleCh0aGlzLmxlbmd0aCwgc3RhcnQgPz8gMCk7XG4gICAgZW5kID0gcG9zaXRpdmVJbmRleCh0aGlzLmxlbmd0aCwgZW5kID8/IHRoaXMubGVuZ3RoKTtcbiAgICBmb3IgKGxldCBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgICAgaWYgKGNhbGxiYWNrLmNhbGwodGhpc0FyZywgdGhpcy5nZXQoaSkhLCBpLCB0aGlzKSkgcmV0dXJuIGk7XG4gICAgfVxuICAgIHJldHVybiAtMTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHRoZSBpbmRleCBvZiB0aGUgbGFzdCB2YWx1ZSBpbiB0aGUgdmVjdG9yIHRoYXQgc2F0aXNmaWVzIHRoZVxuICAgKiBwcm92aWRlZCB0ZXN0aW5nIGZ1bmN0aW9uIG9yIC0xIGlmIGl0IGlzIG5vdCBmb3VuZC5cbiAgICogT3B0aW9uYWxseSwgeW91IGNhbiBzZWFyY2ggYSBzdWJzZXQgb2YgdGhlIHZlY3RvciBieSBwcm92aWRpbmcgYW4gaW5kZXggcmFuZ2UuXG4gICAqIFRoZSBzdGFydCBhbmQgZW5kIHJlcHJlc2VudCB0aGUgaW5kZXggb2YgdmFsdWVzIGluIHRoZSB2ZWN0b3IuXG4gICAqIFRoZSBlbmQgaXMgZXhjbHVzaXZlIG1lYW5pbmcgaXQgd2lsbCBub3QgYmUgaW5jbHVkZWQuXG4gICAqIElmIHRoZSBpbmRleCB2YWx1ZSBpcyBuZWdhdGl2ZSwgaXQgd2lsbCBiZSBzdWJ0cmFjdGVkIGZyb20gdGhlIGVuZCBvZiB0aGUgdmVjdG9yLlxuICAgKi9cbiAgZmluZExhc3RJbmRleChcbiAgICBjYWxsYmFjazogKHZhbHVlOiBULCBpbmRleDogbnVtYmVyLCB2ZWN0b3I6IFZlY3RvcjxUPikgPT4gdW5rbm93bixcbiAgICBzdGFydD86IG51bWJlcixcbiAgICBlbmQ/OiBudW1iZXIsXG4gICk6IG51bWJlcjtcbiAgZmluZExhc3RJbmRleDxVPihcbiAgICBjYWxsYmFjazogKHZhbHVlOiBULCBpbmRleDogbnVtYmVyLCB2ZWN0b3I6IFZlY3RvcjxUPikgPT4gdW5rbm93bixcbiAgICB0aGlzQXJnPzogVSxcbiAgICBzdGFydD86IG51bWJlcixcbiAgICBlbmQ/OiBudW1iZXIsXG4gICk6IG51bWJlcjtcbiAgZmluZExhc3RJbmRleDxVPihcbiAgICBjYWxsYmFjazogKHZhbHVlOiBULCBpbmRleDogbnVtYmVyLCB2ZWN0b3I6IFZlY3RvcjxUPikgPT4gdW5rbm93bixcbiAgICB0aGlzQXJnPzogVSxcbiAgICBzdGFydD86IG51bWJlcixcbiAgICBlbmQ/OiBudW1iZXIsXG4gICk6IG51bWJlciB7XG4gICAgaWYgKHR5cGVvZiB0aGlzQXJnID09PSBcIm51bWJlclwiKSB7XG4gICAgICBlbmQgPSBzdGFydDtcbiAgICAgIHN0YXJ0ID0gdGhpc0FyZztcbiAgICAgIHRoaXNBcmcgPSB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHN0YXJ0ID0gcG9zaXRpdmVJbmRleCh0aGlzLmxlbmd0aCwgc3RhcnQgPz8gMCk7XG4gICAgZW5kID0gcG9zaXRpdmVJbmRleCh0aGlzLmxlbmd0aCwgZW5kID8/IHRoaXMubGVuZ3RoKTtcblxuICAgIGZvciAobGV0IGkgPSBlbmQgLSAxOyBpID49IHN0YXJ0OyBpLS0pIHtcbiAgICAgIGlmIChjYWxsYmFjay5jYWxsKHRoaXNBcmcsIHRoaXMuZ2V0KGkpISwgaSwgdGhpcykpIHJldHVybiBpO1xuICAgIH1cbiAgICByZXR1cm4gLTE7XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyB0aGUgZmlyc3QgdmFsdWUgaW4gdGhlIHZlY3RvciB0aGF0IHNhdGlzZmllcyB0aGVcbiAgICogcHJvdmlkZWQgdGVzdGluZyBmdW5jdGlvbiBvciB1bmRlZmluZWQgaWYgaXQgaXMgbm90IGZvdW5kLlxuICAgKiBPcHRpb25hbGx5LCB5b3UgY2FuIHNlYXJjaCBhIHN1YnNldCBvZiB0aGUgdmVjdG9yIGJ5IHByb3ZpZGluZyBhbiBpbmRleCByYW5nZS5cbiAgICogVGhlIHN0YXJ0IGFuZCBlbmQgcmVwcmVzZW50IHRoZSBpbmRleCBvZiB2YWx1ZXMgaW4gdGhlIHZlY3Rvci5cbiAgICogVGhlIGVuZCBpcyBleGNsdXNpdmUgbWVhbmluZyBpdCB3aWxsIG5vdCBiZSBpbmNsdWRlZC5cbiAgICogSWYgdGhlIGluZGV4IHZhbHVlIGlzIG5lZ2F0aXZlLCBpdCB3aWxsIGJlIHN1YnRyYWN0ZWQgZnJvbSB0aGUgZW5kIG9mIHRoZSB2ZWN0b3IuXG4gICAqL1xuICBmaW5kKFxuICAgIGNhbGxiYWNrOiAodmFsdWU6IFQsIGluZGV4OiBudW1iZXIsIHZlY3RvcjogVmVjdG9yPFQ+KSA9PiB1bmtub3duLFxuICAgIHN0YXJ0PzogbnVtYmVyLFxuICAgIGVuZD86IG51bWJlcixcbiAgKTogVCB8IHVuZGVmaW5lZDtcbiAgZmluZDxVPihcbiAgICBjYWxsYmFjazogKHZhbHVlOiBULCBpbmRleDogbnVtYmVyLCB2ZWN0b3I6IFZlY3RvcjxUPikgPT4gdW5rbm93bixcbiAgICB0aGlzQXJnPzogVSxcbiAgICBzdGFydD86IG51bWJlcixcbiAgICBlbmQ/OiBudW1iZXIsXG4gICk6IFQgfCB1bmRlZmluZWQ7XG4gIGZpbmQ8VT4oXG4gICAgY2FsbGJhY2s6ICh2YWx1ZTogVCwgaW5kZXg6IG51bWJlciwgdmVjdG9yOiBWZWN0b3I8VD4pID0+IHVua25vd24sXG4gICAgdGhpc0FyZz86IFUsXG4gICAgc3RhcnQ/OiBudW1iZXIsXG4gICAgZW5kPzogbnVtYmVyLFxuICApOiBUIHwgdW5kZWZpbmVkIHtcbiAgICBjb25zdCBpbmRleDogbnVtYmVyID0gdGhpcy5maW5kSW5kZXgoY2FsbGJhY2ssIHRoaXNBcmcsIHN0YXJ0LCBlbmQpO1xuICAgIHJldHVybiBpbmRleCAhPT0gLTEgPyB0aGlzLmdldChpbmRleCkgOiB1bmRlZmluZWQ7XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyB0aGUgbGFzdCB2YWx1ZSBpbiB0aGUgdmVjdG9yIHRoYXQgc2F0aXNmaWVzIHRoZVxuICAgKiBwcm92aWRlZCB0ZXN0aW5nIGZ1bmN0aW9uIG9yIHVuZGVmaW5lZCBpZiBpdCBpcyBub3QgZm91bmQuXG4gICAqIE9wdGlvbmFsbHksIHlvdSBjYW4gc2VhcmNoIGEgc3Vic2V0IG9mIHRoZSB2ZWN0b3IgYnkgcHJvdmlkaW5nIGFuIGluZGV4IHJhbmdlLlxuICAgKiBUaGUgc3RhcnQgYW5kIGVuZCByZXByZXNlbnQgdGhlIGluZGV4IG9mIHZhbHVlcyBpbiB0aGUgdmVjdG9yLlxuICAgKiBUaGUgZW5kIGlzIGV4Y2x1c2l2ZSBtZWFuaW5nIGl0IHdpbGwgbm90IGJlIGluY2x1ZGVkLlxuICAgKiBJZiB0aGUgaW5kZXggdmFsdWUgaXMgbmVnYXRpdmUsIGl0IHdpbGwgYmUgc3VidHJhY3RlZCBmcm9tIHRoZSBlbmQgb2YgdGhlIHZlY3Rvci5cbiAgICovXG4gIGZpbmRMYXN0KFxuICAgIGNhbGxiYWNrOiAodmFsdWU6IFQsIGluZGV4OiBudW1iZXIsIHZlY3RvcjogVmVjdG9yPFQ+KSA9PiB1bmtub3duLFxuICAgIHN0YXJ0PzogbnVtYmVyLFxuICAgIGVuZD86IG51bWJlcixcbiAgKTogVCB8IHVuZGVmaW5lZDtcbiAgZmluZExhc3Q8VT4oXG4gICAgY2FsbGJhY2s6ICh2YWx1ZTogVCwgaW5kZXg6IG51bWJlciwgdmVjdG9yOiBWZWN0b3I8VD4pID0+IHVua25vd24sXG4gICAgdGhpc0FyZz86IFUsXG4gICAgc3RhcnQ/OiBudW1iZXIsXG4gICAgZW5kPzogbnVtYmVyLFxuICApOiBUIHwgdW5kZWZpbmVkO1xuICBmaW5kTGFzdDxVPihcbiAgICBjYWxsYmFjazogKHZhbHVlOiBULCBpbmRleDogbnVtYmVyLCB2ZWN0b3I6IFZlY3RvcjxUPikgPT4gdW5rbm93bixcbiAgICB0aGlzQXJnPzogVSxcbiAgICBzdGFydD86IG51bWJlcixcbiAgICBlbmQ/OiBudW1iZXIsXG4gICk6IFQgfCB1bmRlZmluZWQge1xuICAgIGNvbnN0IGluZGV4OiBudW1iZXIgPSB0aGlzLmZpbmRMYXN0SW5kZXgoY2FsbGJhY2ssIHRoaXNBcmcsIHN0YXJ0LCBlbmQpO1xuICAgIHJldHVybiBpbmRleCAhPT0gLTEgPyB0aGlzLmdldChpbmRleCkgOiB1bmRlZmluZWQ7XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyB0cnVlIGlmIGEgdmFsdWUgaW4gdGhlIHZlY3RvciBzYXRpc2ZpZXMgdGhlXG4gICAqIHByb3ZpZGVkIHRlc3RpbmcgZnVuY3Rpb24gb3IgZmFsc2UgaWYgaXQgaXMgbm90IGZvdW5kLlxuICAgKiBPcHRpb25hbGx5LCB5b3UgY2FuIHNlYXJjaCBhIHN1YnNldCBvZiB0aGUgdmVjdG9yIGJ5IHByb3ZpZGluZyBhbiBpbmRleCByYW5nZS5cbiAgICogVGhlIHN0YXJ0IGFuZCBlbmQgcmVwcmVzZW50IHRoZSBpbmRleCBvZiB2YWx1ZXMgaW4gdGhlIHZlY3Rvci5cbiAgICogVGhlIGVuZCBpcyBleGNsdXNpdmUgbWVhbmluZyBpdCB3aWxsIG5vdCBiZSBpbmNsdWRlZC5cbiAgICogSWYgdGhlIGluZGV4IHZhbHVlIGlzIG5lZ2F0aXZlLCBpdCB3aWxsIGJlIHN1YnRyYWN0ZWQgZnJvbSB0aGUgZW5kIG9mIHRoZSB2ZWN0b3IuXG4gICAqL1xuICBzb21lKFxuICAgIGNhbGxiYWNrOiAodmFsdWU6IFQsIGluZGV4OiBudW1iZXIsIHZlY3RvcjogVmVjdG9yPFQ+KSA9PiB1bmtub3duLFxuICAgIHN0YXJ0PzogbnVtYmVyLFxuICAgIGVuZD86IG51bWJlcixcbiAgKTogYm9vbGVhbjtcbiAgc29tZTxVPihcbiAgICBjYWxsYmFjazogKHZhbHVlOiBULCBpbmRleDogbnVtYmVyLCB2ZWN0b3I6IFZlY3RvcjxUPikgPT4gdW5rbm93bixcbiAgICB0aGlzQXJnPzogVSxcbiAgICBzdGFydD86IG51bWJlcixcbiAgICBlbmQ/OiBudW1iZXIsXG4gICk6IGJvb2xlYW47XG4gIHNvbWU8VT4oXG4gICAgY2FsbGJhY2s6ICh2YWx1ZTogVCwgaW5kZXg6IG51bWJlciwgdmVjdG9yOiBWZWN0b3I8VD4pID0+IHVua25vd24sXG4gICAgdGhpc0FyZz86IFUsXG4gICAgc3RhcnQ/OiBudW1iZXIsXG4gICAgZW5kPzogbnVtYmVyLFxuICApOiBib29sZWFuIHtcbiAgICBjb25zdCBpbmRleDogbnVtYmVyID0gdGhpcy5maW5kSW5kZXgoY2FsbGJhY2ssIHRoaXNBcmcsIHN0YXJ0LCBlbmQpO1xuICAgIHJldHVybiBpbmRleCAhPT0gLTE7XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyB0cnVlIGlmIGEgdmFsdWUgaW4gdGhlIHZlY3RvciBzYXRpc2ZpZXMgdGhlXG4gICAqIHByb3ZpZGVkIHRlc3RpbmcgZnVuY3Rpb24gb3IgZmFsc2UgaWYgaXQgaXMgbm90IGZvdW5kLlxuICAgKiBPcHRpb25hbGx5LCB5b3UgY2FuIHNlYXJjaCBhIHN1YnNldCBvZiB0aGUgdmVjdG9yIGJ5IHByb3ZpZGluZyBhbiBpbmRleCByYW5nZS5cbiAgICogVGhlIHN0YXJ0IGFuZCBlbmQgcmVwcmVzZW50IHRoZSBpbmRleCBvZiB2YWx1ZXMgaW4gdGhlIHZlY3Rvci5cbiAgICogVGhlIGVuZCBpcyBleGNsdXNpdmUgbWVhbmluZyBpdCB3aWxsIG5vdCBiZSBpbmNsdWRlZC5cbiAgICogSWYgdGhlIGluZGV4IHZhbHVlIGlzIG5lZ2F0aXZlLCBpdCB3aWxsIGJlIHN1YnRyYWN0ZWQgZnJvbSB0aGUgZW5kIG9mIHRoZSB2ZWN0b3IuXG4gICAqL1xuICBldmVyeShcbiAgICBjYWxsYmFjazogKHZhbHVlOiBULCBpbmRleDogbnVtYmVyLCB2ZWN0b3I6IFZlY3RvcjxUPikgPT4gdW5rbm93bixcbiAgICBzdGFydD86IG51bWJlcixcbiAgICBlbmQ/OiBudW1iZXIsXG4gICk6IGJvb2xlYW47XG4gIGV2ZXJ5PFU+KFxuICAgIGNhbGxiYWNrOiAodmFsdWU6IFQsIGluZGV4OiBudW1iZXIsIHZlY3RvcjogVmVjdG9yPFQ+KSA9PiB1bmtub3duLFxuICAgIHRoaXNBcmc/OiBVLFxuICAgIHN0YXJ0PzogbnVtYmVyLFxuICAgIGVuZD86IG51bWJlcixcbiAgKTogYm9vbGVhbjtcbiAgZXZlcnk8VT4oXG4gICAgY2FsbGJhY2s6ICh2YWx1ZTogVCwgaW5kZXg6IG51bWJlciwgdmVjdG9yOiBWZWN0b3I8VD4pID0+IHVua25vd24sXG4gICAgdGhpc0FyZz86IFUsXG4gICAgc3RhcnQ/OiBudW1iZXIsXG4gICAgZW5kPzogbnVtYmVyLFxuICApOiBib29sZWFuIHtcbiAgICBjb25zdCBpbmRleDogbnVtYmVyID0gdGhpcy5maW5kSW5kZXgoXG4gICAgICBmdW5jdGlvbiAodGhpczogVSwgdmFsdWU6IFQsIGluZGV4OiBudW1iZXIsIHZlY3RvcjogVmVjdG9yPFQ+KSB7XG4gICAgICAgIHJldHVybiAhY2FsbGJhY2suY2FsbCh0aGlzLCB2YWx1ZSwgaW5kZXgsIHZlY3Rvcik7XG4gICAgICB9LFxuICAgICAgdGhpc0FyZyxcbiAgICAgIHN0YXJ0LFxuICAgICAgZW5kLFxuICAgICk7XG4gICAgcmV0dXJuIGluZGV4ID09PSAtMTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHRoZSBmaXJzdCBpbmRleCBhdCB3aGljaCB0aGUgc2VhcmNoIHZhbHVlIGNhbiBiZSBmb3VuZCBpbiB0aGUgdmVjdG9yLFxuICAgKiBvciAtMSBpZiBpdCBpcyBub3QgZm91bmQuIFRoaXMgdXNlcyBzdHJpY3QgZXF1YWxpdHkgY2hlY2tzLlxuICAgKiBPcHRpb25hbGx5LCB5b3UgY2FuIHNlYXJjaCBhIHN1YnNldCBvZiB0aGUgdmVjdG9yIGJ5IHByb3ZpZGluZyBhbiBpbmRleCByYW5nZS5cbiAgICogVGhlIHN0YXJ0IGFuZCBlbmQgcmVwcmVzZW50IHRoZSBpbmRleCBvZiB2YWx1ZXMgaW4gdGhlIHZlY3Rvci5cbiAgICogVGhlIGVuZCBpcyBleGNsdXNpdmUgbWVhbmluZyBpdCB3aWxsIG5vdCBiZSBpbmNsdWRlZC5cbiAgICogSWYgdGhlIGluZGV4IHZhbHVlIGlzIG5lZ2F0aXZlLCBpdCB3aWxsIGJlIHN1YnRyYWN0ZWQgZnJvbSB0aGUgZW5kIG9mIHRoZSB2ZWN0b3IuXG4gICAqL1xuICBpbmRleE9mKHNlYXJjaFZhbHVlOiBULCBzdGFydD86IG51bWJlciwgZW5kPzogbnVtYmVyKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdGhpcy5maW5kSW5kZXgoKHZhbHVlOiBUKSA9PiB2YWx1ZSA9PT0gc2VhcmNoVmFsdWUsIHN0YXJ0LCBlbmQpO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgdGhlIGxhc3QgaW5kZXggYXQgd2hpY2ggdGhlIHNlYXJjaCB2YWx1ZSBjYW4gYmUgZm91bmQgaW4gdGhlIHZlY3RvcixcbiAgICogb3IgLTEgaWYgaXQgaXMgbm90IGZvdW5kLiBUaGlzIHVzZXMgc3RyaWN0IGVxdWFsaXR5IGNoZWNrcy5cbiAgICogT3B0aW9uYWxseSwgeW91IGNhbiBzZWFyY2ggYSBzdWJzZXQgb2YgdGhlIHZlY3RvciBieSBwcm92aWRpbmcgYW4gaW5kZXggcmFuZ2UuXG4gICAqIFRoZSBzdGFydCBhbmQgZW5kIHJlcHJlc2VudCB0aGUgaW5kZXggb2YgdmFsdWVzIGluIHRoZSB2ZWN0b3IuXG4gICAqIFRoZSBlbmQgaXMgZXhjbHVzaXZlIG1lYW5pbmcgaXQgd2lsbCBub3QgYmUgaW5jbHVkZWQuXG4gICAqIElmIHRoZSBpbmRleCB2YWx1ZSBpcyBuZWdhdGl2ZSwgaXQgd2lsbCBiZSBzdWJ0cmFjdGVkIGZyb20gdGhlIGVuZCBvZiB0aGUgdmVjdG9yLlxuICAgKi9cbiAgbGFzdEluZGV4T2Yoc2VhcmNoVmFsdWU6IFQsIHN0YXJ0PzogbnVtYmVyLCBlbmQ/OiBudW1iZXIpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLmZpbmRMYXN0SW5kZXgoKHZhbHVlOiBUKSA9PiB2YWx1ZSA9PT0gc2VhcmNoVmFsdWUsIHN0YXJ0LCBlbmQpO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgc2VhcmNoIHZhbHVlIGNhbiBiZSBmb3VuZCBpbiB0aGUgdmVjdG9yLFxuICAgKiBvciBmYWxzZSBpZiBpdCBpcyBub3QgZm91bmQuIFRoaXMgdXNlcyBzdHJpY3QgZXF1YWxpdHkgY2hlY2tzLlxuICAgKiBPcHRpb25hbGx5LCB5b3UgY2FuIHNlYXJjaCBhIHN1YnNldCBvZiB0aGUgdmVjdG9yIGJ5IHByb3ZpZGluZyBhbiBpbmRleCByYW5nZS5cbiAgICogVGhlIHN0YXJ0IGFuZCBlbmQgcmVwcmVzZW50IHRoZSBpbmRleCBvZiB2YWx1ZXMgaW4gdGhlIHZlY3Rvci5cbiAgICogVGhlIGVuZCBpcyBleGNsdXNpdmUgbWVhbmluZyBpdCB3aWxsIG5vdCBiZSBpbmNsdWRlZC5cbiAgICogSWYgdGhlIGluZGV4IHZhbHVlIGlzIG5lZ2F0aXZlLCBpdCB3aWxsIGJlIHN1YnRyYWN0ZWQgZnJvbSB0aGUgZW5kIG9mIHRoZSB2ZWN0b3IuXG4gICAqL1xuICBpbmNsdWRlcyhzZWFyY2hWYWx1ZTogVCwgc3RhcnQ/OiBudW1iZXIsIGVuZD86IG51bWJlcik6IGJvb2xlYW4ge1xuICAgIGNvbnN0IGluZGV4OiBudW1iZXIgPSB0aGlzLmluZGV4T2Yoc2VhcmNoVmFsdWUsIHN0YXJ0LCBlbmQpO1xuICAgIHJldHVybiBpbmRleCAhPT0gLTE7XG4gIH1cblxuICAvKipcbiAgICogTWVyZ2VzIHR3byBvciBtb3JlIGl0ZXJhYmxlcyB0b2dldGhlci5cbiAgICogVGhpcyBkb2VzIG5vdCBjaGFuZ2UgZXhpc3RpbmcgSXRlcmFibGVzLCBpdCByZXR1cm5zIGEgbmV3IFZlY3Rvci5cbiAgICovXG4gIGNvbmNhdDxVPiguLi52YWx1ZXM6IChWZWN0b3I8VT4gfCBDb25jYXRBcnJheTxVPilbXSk6IFZlY3RvcjxVPiB7XG4gICAgY29uc3QgdmVjdG9yOiBWZWN0b3I8VT4gPSBuZXcgVmVjdG9yKCk7XG4gICAgdmVjdG9yLmRhdGEgPSB0aGlzLnRvQXJyYXkoKSBhcyB1bmtub3duIGFzIFVbXTtcbiAgICB2ZWN0b3IuZGF0YSA9IHZlY3Rvci5kYXRhLmNvbmNhdFxuICAgICAgLmFwcGx5KFxuICAgICAgICB2ZWN0b3IuZGF0YSxcbiAgICAgICAgdmFsdWVzLm1hcCgodmFsdWU6IFZlY3RvcjxVPiB8IENvbmNhdEFycmF5PFU+KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHZhbHVlIGluc3RhbmNlb2YgVmVjdG9yID8gdmFsdWUudG9BcnJheSgpIDogdmFsdWU7XG4gICAgICAgIH0pIGFzIENvbmNhdEFycmF5PFU+W10sXG4gICAgICApO1xuICAgIHZlY3Rvci5fbGVuZ3RoID0gdmVjdG9yLmRhdGEubGVuZ3RoO1xuICAgIHZlY3Rvci5fY2FwYWNpdHkgPSB2ZWN0b3IuX2xlbmd0aDtcbiAgICB2ZWN0b3IuZW5kID0gdmVjdG9yLl9sZW5ndGggLSAxO1xuICAgIHJldHVybiB2ZWN0b3I7XG4gIH1cblxuICAvKipcbiAgICogU29ydHMgdGhlIHZhbHVlcyBvZiB0aGUgdmVjdG9yIGluIHBsYWNlIHRoZW4gcmV0dXJucyBpdC5cbiAgICogVGhpcyB1c2VzIEFycmF5IHNvcnQgbWV0aG9kIGludGVybmFsbHkuXG4gICAqIElmIHRoZSB2ZWN0b3IgaGFzIGJlZW4gc2hpZnRlZCBpdCBtYXkgdHJpZ2dlciByZWFsbG9jYXRpb24gYmVmb3JlIHNvcnRpbmcuXG4gICAqL1xuICBzb3J0KGNvbXBhcmU/OiBjb21wYXJlPFQ+KSB7XG4gICAgaWYgKHRoaXMuc3RhcnQgIT09IDApIHtcbiAgICAgIHRoaXMuZGF0YSA9IHRoaXMudG9BcnJheSgpO1xuICAgICAgdGhpcy5zdGFydCA9IDA7XG4gICAgICB0aGlzLmVuZCA9IHRoaXMubGVuZ3RoIC0gMTtcbiAgICB9XG5cbiAgICBpZiAoY29tcGFyZSkgdGhpcy5kYXRhLnNvcnQoY29tcGFyZSk7XG4gICAgZWxzZSB0aGlzLmRhdGEuc29ydCgpO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLyoqIFJlbW92ZXMgYWxsIHZhbHVlcyBmcm9tIHRoZSB2ZWN0b3IuICovXG4gIGNsZWFyKCk6IHZvaWQge1xuICAgIGlmICh0aGlzLmxlbmd0aCAhPT0gMCkge1xuICAgICAgdGhpcy5kYXRhID0gW107XG4gICAgICB0aGlzLmRhdGEubGVuZ3RoID0gdGhpcy5jYXBhY2l0eTtcbiAgICAgIHRoaXMuX2xlbmd0aCA9IDA7XG4gICAgfVxuICAgIHRoaXMuc3RhcnQgPSAwO1xuICAgIHRoaXMuZW5kID0gLTE7XG4gIH1cblxuICAvKiogQ2hlY2tzIGlmIHRoZSB2ZWN0b3IgaXMgZW1wdHkuICovXG4gIGlzRW1wdHkoKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHRoaXMubGVuZ3RoID09PSAwO1xuICB9XG5cbiAgLyoqXG4gICAqIENvbnZlcnRzIHRoZSB2ZWN0b3IgdG8gYW4gYXJyYXkuXG4gICAqIEl0J3MgcmVjb21tZW5kZWQgdG8gdXNlIHRoaXMgaW5zdGVhZCBvZiBgQXJyYXkuZnJvbWAgYmVjYXVzZVxuICAgKiB0aGlzIG1ldGhvZCBpcyBzaWduaWZpY2FudGx5IGZhc3Rlci5cbiAgICovXG4gIHRvQXJyYXkoKTogVFtdIHtcbiAgICByZXR1cm4gKHRoaXMuZW5kID49IHRoaXMuc3RhcnRcbiAgICAgID8gdGhpcy5kYXRhLnNsaWNlKHRoaXMuc3RhcnQsIHRoaXMuZW5kICsgMSlcbiAgICAgIDogKHRoaXMuZGF0YVxuICAgICAgICAuc2xpY2UodGhpcy5zdGFydCwgdGhpcy5jYXBhY2l0eSlcbiAgICAgICAgLmNvbmNhdCh0aGlzLmRhdGEuc2xpY2UoMCwgdGhpcy5lbmQgKyAxKSkpKSBhcyBUW107XG4gIH1cblxuICAvKiogUmV0dXJucyBhbiBpdGVyYXRvciBmb3IgcmV0cmlldmluZyBhbmQgcmVtb3ZpbmcgdmFsdWVzIGZyb20gdGhlIHZlY3RvciAoZnJvbSBsZWZ0LXRvLXJpZ2h0KS4gKi9cbiAgKmRyYWluKCk6IEl0ZXJhYmxlSXRlcmF0b3I8VD4ge1xuICAgIHdoaWxlICghdGhpcy5pc0VtcHR5KCkpIHtcbiAgICAgIHlpZWxkIHRoaXMuc2hpZnQoKSBhcyBUO1xuICAgIH1cbiAgfVxuXG4gIC8qKiBSZXR1cm5zIGFuIGl0ZXJhdG9yIGZvciByZXRyaWV2aW5nIGFuZCByZW1vdmluZyB2YWx1ZXMgZnJvbSB0aGUgdmVjdG9yIChmcm9tIHJpZ2h0LXRvLWxlZnQpLiAqL1xuICAqZHJhaW5SaWdodCgpOiBJdGVyYWJsZUl0ZXJhdG9yPFQ+IHtcbiAgICB3aGlsZSAoIXRoaXMuaXNFbXB0eSgpKSB7XG4gICAgICB5aWVsZCB0aGlzLnBvcCgpIGFzIFQ7XG4gICAgfVxuICB9XG5cbiAgLyoqIFJldHVybnMgYW4gaXRlcmF0b3IgZm9yIHJldHJpZXZpbmcgdmFsdWVzIGZyb20gdGhlIHZlY3RvciAoZnJvbSBsZWZ0LXRvLXJpZ2h0KS4gKi9cbiAgKnZhbHVlcygpOiBJdGVyYWJsZUl0ZXJhdG9yPFQ+IHtcbiAgICBsZXQgb2Zmc2V0ID0gMDtcbiAgICB3aGlsZSAob2Zmc2V0IDwgdGhpcy5sZW5ndGgpIHtcbiAgICAgIGNvbnN0IGlkeCA9ICh0aGlzLnN0YXJ0ICsgb2Zmc2V0KyspICUgdGhpcy5jYXBhY2l0eTtcbiAgICAgIHlpZWxkIHRoaXMuZGF0YVtpZHhdIGFzIFQ7XG4gICAgfVxuICB9XG5cbiAgLyoqIFJldHVybnMgYW4gaXRlcmF0b3IgZm9yIHJldHJpZXZpbmcgdmFsdWVzIGZyb20gdGhlIHZlY3RvciAoZnJvbSByaWdodC10by1sZWZ0KS4gKi9cbiAgKnZhbHVlc1JpZ2h0KCk6IEl0ZXJhYmxlSXRlcmF0b3I8VD4ge1xuICAgIGxldCBvZmZzZXQgPSAwO1xuICAgIHdoaWxlIChvZmZzZXQgPCB0aGlzLmxlbmd0aCkge1xuICAgICAgbGV0IGluZGV4ID0gdGhpcy5lbmQgLSBvZmZzZXQrKztcbiAgICAgIGlmIChpbmRleCA8IDApIGluZGV4ID0gdGhpcy5jYXBhY2l0eSArIGluZGV4O1xuICAgICAgeWllbGQgdGhpcy5kYXRhW2luZGV4XSBhcyBUO1xuICAgIH1cbiAgfVxuXG4gIC8qKiBSZXR1cm5zIGFuIGl0ZXJhdG9yIGZvciByZXRyaWV2aW5nIHZhbHVlcyBmcm9tIHRoZSB2ZWN0b3IgKGZyb20gbGVmdC10by1yaWdodCkuICovXG4gICpbU3ltYm9sLml0ZXJhdG9yXSgpOiBJdGVyYWJsZUl0ZXJhdG9yPFQ+IHtcbiAgICB5aWVsZCogdGhpcy52YWx1ZXMoKTtcbiAgfVxufVxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUlBLE1BQU0sV0FBVyxHQUFXLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUMsQUFBQztBQUVoRCxTQUFTLGFBQWEsQ0FBQyxNQUFjLEVBQUUsS0FBYSxFQUFFLFNBQVMsR0FBRyxLQUFLLEVBQUU7SUFDdkUsS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDMUIsSUFBSSxLQUFLLEdBQUcsQ0FBQyxNQUFNLEVBQUUsS0FBSyxHQUFHLENBQUMsQ0FBQztJQUMvQixJQUFJLEtBQUssR0FBRyxDQUFDLEVBQUUsS0FBSyxJQUFJLE1BQU0sQ0FBQztJQUMvQixJQUFJLEtBQUssSUFBSSxNQUFNLEVBQUUsS0FBSyxHQUFHLE1BQU0sR0FBRyxDQUFDLFNBQVMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDMUQsT0FBTyxLQUFLLENBQUM7Q0FDZDtBQUVELFNBQVMsTUFBTSxDQUNiLFFBQTZCLEVBQzdCLE1BQWMsRUFDZCxJQUFZLEVBQ1osUUFBd0UsRUFDeEUsWUFBZ0IsRUFDYjtJQUNILElBQUks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