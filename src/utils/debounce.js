export default function  debounced  (func, delay) {
    let isInTimeout;
    return (...args) => {
        clearTimeout(isInTimeout);
        isInTimeout = setTimeout(() => {
            func(...args)
        }, delay)
    }
};